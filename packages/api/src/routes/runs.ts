import { Router } from "express";
import { RunMode, RunOutcome, AtsType } from "@dejsol/core";
import { ApiError } from "../middleware/error-handler.js";
import type {
  StartRunBody,
  RunListQuery,
  ApiResponse,
  RunListResponse,
  RunStatusResponse,
  VerificationQueueResponse,
  VerificationCodeBody,
} from "../types.js";
import type { ApplyRun } from "@dejsol/core";
import type { TemporalClientWrapper } from "../temporal-client.js";
import type { PrismaClient } from "@prisma/client";
import { queryVerificationRuns, computeKpiSnapshot, persistAnswerBank } from "../persistence.js";
import type { AnswerBank, AnswerBankEntry } from "@dejsol/core";
import type { KpiResponse } from "../types.js";

export const runsRouter = Router();

/**
 * Recommendations on a ScreeningAnswerEntry.adjudication block that flag the
 * entry as needing operator attention before its value can be trusted or
 * banked.  Mirrors the values in @dejsol/intelligence's PolicyDecision.
 */
const REVIEW_RECOMMENDATIONS: ReadonlySet<string> = new Set([
  "human_review_required",
  "reject",
]);

/**
 * Derive answer-review metrics from an answersJson blob.
 *
 * Accepts the loose shape persisted by runGreenhouseHappyPathActivity:
 *   {
 *     screeningAnswers: Array<{ adjudication?: { recommendation?: string } }>,
 *     answerReviewRequired?: boolean,
 *     answerReviewCount?: number,
 *   }
 *
 * Prefers the persisted derived values when present; otherwise recomputes
 * from the screeningAnswers array.  Returns zeros for any non-object input.
 */
function deriveAnswerReviewMetrics(
  answersJson: unknown,
): { answerReviewRequired: boolean; answerReviewCount: number } {
  if (!answersJson || typeof answersJson !== "object") {
    return { answerReviewRequired: false, answerReviewCount: 0 };
  }
  const bag = answersJson as Record<string, unknown>;
  const persistedCount = typeof bag["answerReviewCount"] === "number" ? bag["answerReviewCount"] as number : undefined;
  const persistedFlag = typeof bag["answerReviewRequired"] === "boolean" ? bag["answerReviewRequired"] as boolean : undefined;
  if (persistedCount !== undefined && persistedFlag !== undefined) {
    return { answerReviewRequired: persistedFlag, answerReviewCount: persistedCount };
  }
  const list = bag["screeningAnswers"];
  if (!Array.isArray(list)) {
    return { answerReviewRequired: false, answerReviewCount: 0 };
  }
  let answerReviewCount = 0;
  for (const entry of list) {
    const rec = (entry as { adjudication?: { recommendation?: string } } | null | undefined)
      ?.adjudication?.recommendation;
    if (typeof rec === "string" && REVIEW_RECOMMENDATIONS.has(rec)) answerReviewCount += 1;
  }
  return { answerReviewRequired: answerReviewCount > 0, answerReviewCount };
}

/**
 * Enrich a raw run record with computed fields for external consumers.
 * Does not mutate the input — returns a new object.
 */
function withComputedFields<T extends { outcome?: string | null; answersJson?: unknown }>(
  run: T,
): T & { actionRequired: boolean; answerReviewRequired: boolean; answerReviewCount: number } {
  const outcome = run.outcome ?? null;
  const { answerReviewRequired, answerReviewCount } = deriveAnswerReviewMetrics(run.answersJson);
  const actionRequired =
    outcome === "VERIFICATION_REQUIRED" ||
    outcome === "ESCALATED" ||
    answerReviewRequired;
  return { ...run, actionRequired, answerReviewRequired, answerReviewCount };
}

/**
 * POST /api/runs — Start a new apply run (triggers the Temporal workflow).
 *
 * Validates the payload, creates a run record, and starts the
 * applyWorkflow via the Temporal client.
 *
 * Workflow start behavior:
 * - If the server has a Temporal client configured (req.app.locals.temporalClient)
 *   and the request includes jobUrl + atsType, the workflow is started immediately.
 * - Otherwise the run record is created without a live workflow (useful for
 *   testing the API surface in isolation).
 *
 * Production path (not yet fully wired):
 * - Look up JobOpportunity by jobId to get jobUrl + atsType.
 * - Create an ApplyRun row in the database.
 * - Start applyWorkflow via Temporal client.
 */
runsRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as StartRunBody;

    if (!body.jobId || !body.candidateId || !body.mode) {
      throw ApiError.badRequest(
        "Missing required fields: jobId, candidateId, mode",
      );
    }

    if (!Object.values(RunMode).includes(body.mode)) {
      throw ApiError.badRequest(`Invalid mode: ${body.mode}`);
    }

    if (body.atsType && !Object.values(AtsType).includes(body.atsType)) {
      throw ApiError.badRequest(`Invalid atsType: ${body.atsType}`);
    }

    const runId = crypto.randomUUID();

    const temporalClient = req.app.locals.temporalClient as TemporalClientWrapper | undefined;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    // ── Bootstrap the apply_runs row BEFORE starting the workflow ─────────
    // Downstream Temporal activities (e.g. persistScreeningAnswers) issue an
    // update-by-id against apply_runs. Without this row they hit P2025 and
    // silently drop the write, which is why answerReviewRequired /
    // answerReviewCount never surface through GET /api/runs/:id/status in
    // deployed runs. Must precede startWorkflow so the row is visible by the
    // time the first activity executes.
    //
    // Best-effort: tests without a PrismaClient and callers supplying
    // non-existent jobId/candidateId (FK violation → P2003) continue to work
    // — we log and fall through rather than 500 the request.
    let bootstrapWarning: string | undefined;
    if (prismaClient) {
      try {
        await prismaClient.applyRun.create({
          data: {
            id: runId,
            jobId: body.jobId,
            candidateId: body.candidateId,
            mode: body.mode,
            resumeFile: body.resumeFile ?? null,
          },
        });
      } catch (dbErr) {
        // PrismaClientKnownRequestError carries .code / .meta. We avoid an
        // `instanceof` import from @prisma/client (runtime-heavy) and inspect
        // the fields defensively — anything that walks like a Prisma error
        // gets its full code/meta surfaced; anything else falls back to the
        // raw message.
        const e = dbErr as {
          name?: unknown;
          code?: unknown;
          meta?: unknown;
          message?: unknown;
        } | null;
        const errName = typeof e?.name === "string" ? e.name : "Error";
        const errCode = typeof e?.code === "string" ? e.code : undefined;
        const errMeta = e && typeof e.meta === "object" ? e.meta : undefined;
        const rawMsg =
          dbErr instanceof Error
            ? dbErr.message
            : typeof e?.message === "string"
              ? e.message
              : String(dbErr);
        // Prisma messages are multiline and often begin with a blank line —
        // collapse to a single line and pick the first non-empty segment so
        // the warning summary is never empty.
        const msgLine =
          rawMsg
            .split("\n")
            .map(s => s.trim())
            .find(s => s.length > 0) ?? "(empty)";

        bootstrapWarning = errCode
          ? `apply_runs row not created (${errCode}: ${msgLine})`
          : `apply_runs row not created (${msgLine})`;

        console.warn(
          `[api/runs] ${bootstrapWarning}`,
          {
            runId,
            jobId: body.jobId,
            candidateId: body.candidateId,
            errName,
            errCode,
            errMeta,
            errMessage: rawMsg,
          },
        );
      }
    }

    // ── Resolve jobUrl + atsType for the workflow start ─────────────────
    // The Temporal workflow needs jobUrl + atsType to navigate and detect
    // fields. Prefer values supplied in the request body (backward-compat
    // with callers that already send them), but fall back to the
    // job_opportunities row — which callers like CandidateOS have already
    // populated via POST /api/jobs/sync keyed by this same body.jobId.
    //
    // This decouples the run-start contract from the workflow input shape:
    // any consumer that has synced a job via /api/jobs/sync can kick off a
    // run with just { jobId, candidateId, mode } and the API resolves the
    // rest from Postgres. Avoids the silent "workflow never started" trap
    // where the body guard fails quietly and the worker sits idle.
    let resolvedJobUrl: string | undefined =
      typeof body.jobUrl === "string" && body.jobUrl.length > 0
        ? body.jobUrl
        : undefined;
    let resolvedAtsType: AtsType | undefined = body.atsType;
    let workflowResolveWarning: string | undefined;
    if (prismaClient && (!resolvedJobUrl || !resolvedAtsType)) {
      try {
        const jobRow = await prismaClient.jobOpportunity.findUnique({
          where: { id: body.jobId },
          select: { jobUrl: true, atsType: true },
        });
        if (jobRow) {
          if (!resolvedJobUrl && jobRow.jobUrl) resolvedJobUrl = jobRow.jobUrl;
          // Prisma-generated AtsType is structurally identical to
          // @dejsol/core's AtsType but nominally distinct to TS; cast
          // through unknown rather than relax the workflow-input type.
          if (!resolvedAtsType && jobRow.atsType) {
            resolvedAtsType = jobRow.atsType as unknown as AtsType;
          }
        } else {
          workflowResolveWarning =
            `job_opportunities row '${body.jobId}' not found — workflow cannot start without jobUrl + atsType`;
          console.warn(`[api/runs] ${workflowResolveWarning}`, {
            runId,
            jobId: body.jobId,
          });
        }
      } catch (lookupErr) {
        // Non-fatal: treat as "could not resolve" and fall through. The
        // guard below will simply skip the workflow start and the caller
        // sees a bootstrapWarning-style message on the response.
        const msg = lookupErr instanceof Error ? lookupErr.message : String(lookupErr);
        workflowResolveWarning =
          `job_opportunities lookup failed (${msg.split("\n").map(s => s.trim()).find(s => s.length > 0) ?? "(empty)"})`;
        console.warn(`[api/runs] ${workflowResolveWarning}`, {
          runId,
          jobId: body.jobId,
        });
      }
    }

    // Attempt to start the Temporal workflow when the client is wired and
    // both inputs were resolved (from body or from job_opportunities).
    let workflowStarted = false;
    if (temporalClient && resolvedJobUrl && resolvedAtsType) {
      try {
        await temporalClient.startWorkflow(runId, {
          runId,
          jobId: body.jobId,
          candidateId: body.candidateId,
          jobUrl: resolvedJobUrl,
          mode: body.mode,
          atsType: resolvedAtsType,
          resumeFile: body.resumeFile ?? null,
        });
        workflowStarted = true;
      } catch (workflowErr) {
        // Log but do not fail the API request — the run record is still
        // created so the caller has a runId to poll for status.
        console.error("[api/runs] Failed to start Temporal workflow:", workflowErr);
      }
    } else if (temporalClient && !workflowResolveWarning) {
      // Temporal client is wired but we have neither body values nor a
      // job row to resolve from. Surface this explicitly so the caller
      // doesn't silently treat a non-started workflow as "running."
      workflowResolveWarning =
        "workflow not started — jobUrl and atsType unavailable (body missing and no matching job_opportunities row)";
      console.warn(`[api/runs] ${workflowResolveWarning}`, {
        runId,
        jobId: body.jobId,
      });
    }

    const stub: ApplyRun = {
      id: runId,
      jobId: body.jobId,
      candidateId: body.candidateId,
      mode: body.mode,
      runtimeProvider: null,
      resumeFile: body.resumeFile ?? null,
      currentState: null,
      stateHistoryJson: [],
      answersJson: {},
      errorLogJson: [],
      artifactUrlsJson: {},
      confirmationId: null,
      outcome: null,
      humanInterventions: 0,
      costJson: {},
      startedAt: new Date(),
      completedAt: null,
    };

    const baseMessage = workflowStarted
      ? "Run started and workflow triggered"
      : "Run started successfully";
    const suffixes = [bootstrapWarning, workflowResolveWarning].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const response: ApiResponse<ApplyRun> = {
      success: true,
      data: stub,
      message: suffixes.length > 0
        ? `${baseMessage} (${suffixes.join("; ")})`
        : baseMessage,
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs/kpi?period=24h|7d|30d — Compute dashboard KPI snapshot.
 *
 * IMPORTANT: registered before /:id so the static path segment takes priority.
 *
 * Aggregates apply_runs for the requested period plus the prior period
 * (for delta computation), returning a KpiSnapshot ready for the dashboard.
 * Falls back to an empty zero-value snapshot when the DB client is not wired.
 */
runsRouter.get("/kpi", async (req, res, next) => {
  try {
    const rawPeriod = (req.query["period"] as string | undefined) ?? "7d";
    if (rawPeriod !== "24h" && rawPeriod !== "7d" && rawPeriod !== "30d") {
      throw ApiError.badRequest(
        `Invalid period "${rawPeriod}". Must be one of: 24h, 7d, 30d.`,
      );
    }
    const period = rawPeriod;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (prismaClient) {
      const snapshot = await computeKpiSnapshot(prismaClient, period);
      const response: KpiResponse = { success: true, data: snapshot };
      return res.json(response);
    }

    // No DB client — return a zero-value snapshot so the dashboard degrades
    // gracefully without crashing (matches the mock shape exactly).
    const zero = { current: 0, previous: 0, formatted: "0" };
    const emptySnapshot: import("../types.js").KpiSnapshot = {
      period: period as import("../types.js").KpiPeriod,
      generatedAt: new Date().toISOString(),
      successRate: { ...zero, formatted: "0.0%" },
      hitlRate: { ...zero, formatted: "0.0%" },
      llmCostUsd: { ...zero, formatted: "$0.00" },
      deterministicRate: { ...zero, formatted: "0.0%" },
      totalRuns: zero,
      submittedRuns: zero,
      failedRuns: zero,
      verificationRequiredRuns: zero,
      avgRunDurationSec: { ...zero, formatted: "0s" },
      reviewPendingCount: 0,
    };
    const response: KpiResponse = { success: true, data: emptySnapshot };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs/verification-required — List runs awaiting email verification.
 *
 * IMPORTANT: This route must be registered before GET /api/runs/:id so Express
 * matches the static path segment first and does not interpret
 * "verification-required" as a run ID.
 *
 * Returns apply_runs with outcome = VERIFICATION_REQUIRED joined with their
 * job_opportunities record, newest-first.  Falls back to an empty list when
 * the PrismaClient is not injected (e.g. test environments without a DB).
 */
runsRouter.get("/verification-required", async (req, res, next) => {
  try {
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (prismaClient) {
      const items = await queryVerificationRuns(prismaClient);
      const response: VerificationQueueResponse = {
        success: true,
        data: items,
      };
      return res.json(response);
    }

    // No DB client — return empty list (test / cold-start path)
    const response: VerificationQueueResponse = {
      success: true,
      data: [],
      message: "DB not connected — no verification-required runs available.",
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs — List apply runs with optional filters.
 *
 * Query params: outcome, candidateId, page, pageSize.
 * Includes candidate name and job company/title via relations.
 */
runsRouter.get("/", async (req, res, next) => {
  try {
    const query = req.query as RunListQuery;
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);

    if (query.outcome && !Object.values(RunOutcome).includes(query.outcome)) {
      throw ApiError.badRequest(`Invalid outcome filter: ${query.outcome}`);
    }

    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (prismaClient) {
      const where: Record<string, unknown> = {};
      if (query.outcome) where.outcome = query.outcome;
      if (query.candidateId) where.candidateId = query.candidateId;

      const [runs, total] = await Promise.all([
        prismaClient.applyRun.findMany({
          where,
          include: {
            candidate: { select: { name: true, email: true } },
            job: { select: { company: true, jobTitle: true, jobUrl: true } },
          },
          orderBy: { startedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prismaClient.applyRun.count({ where }),
      ]);

      const response = {
        success: true,
        data: runs.map(withComputedFields),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
      return res.json(response);
    }

    const response: RunListResponse = {
      success: true,
      data: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs/:id — Get a single apply run with candidate and job details.
 */
runsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (prismaClient) {
      const run = await prismaClient.applyRun.findUnique({
        where: { id },
        include: {
          candidate: { select: { name: true, email: true } },
          job: { select: { company: true, jobTitle: true, jobUrl: true } },
        },
      });
      if (!run) throw ApiError.notFound("Run", id);
      return res.json({ success: true, data: withComputedFields(run) });
    }

    throw ApiError.notFound("Run", id);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs/:id/status — Get live workflow status/progress for a run.
 *
 * Queries the Temporal workflow via workflowStatusQuery and progressQuery
 * when a Temporal client is available.  Falls back to a neutral stub
 * when no client is configured (e.g., tests running without a Temporal server).
 */
runsRouter.get("/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const temporalClient = req.app.locals.temporalClient as TemporalClientWrapper | undefined;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    // Derive answer-review metrics from apply_runs.answers_json when available
    // so consumers polling /status can see the flag without a second request.
    let reviewMetrics = { answerReviewRequired: false, answerReviewCount: 0 };
    if (prismaClient) {
      try {
        const row = await prismaClient.applyRun.findUnique({
          where: { id },
          select: { answersJson: true },
        });
        reviewMetrics = deriveAnswerReviewMetrics(row?.answersJson ?? null);
      } catch {
        // Non-fatal — /status degrades to metrics-less response.
      }
    }

    if (temporalClient) {
      try {
        const [statusRaw, progressRaw] = await Promise.all([
          temporalClient.queryWorkflowStatus(id),
          temporalClient.queryProgress(id),
        ]);

        const status = statusRaw as {
          currentState: string | null;
          phase: string;
          statesCompleted: string[];
          errors: unknown[];
        };
        const progress = progressRaw as {
          percentComplete: number;
        };

        const liveStatus: RunStatusResponse = {
          runId: id,
          currentState: (status.currentState as import("@dejsol/core").StateName | null) ?? null,
          phase: status.phase ?? "initializing",
          statesCompleted: (status.statesCompleted ?? []) as import("@dejsol/core").StateName[],
          percentComplete: progress.percentComplete ?? 0,
          answerReviewRequired: reviewMetrics.answerReviewRequired,
          answerReviewCount: reviewMetrics.answerReviewCount,
        };

        return res.json({ success: true, data: liveStatus } satisfies ApiResponse<RunStatusResponse>);
      } catch (queryErr) {
        // Workflow may not exist yet or may have completed — fall through to stub.
        console.warn("[api/runs] Could not query workflow status:", queryErr);
      }
    }

    const stub: RunStatusResponse = {
      runId: id,
      currentState: null,
      phase: "initializing",
      statesCompleted: [],
      percentComplete: 0,
      answerReviewRequired: reviewMetrics.answerReviewRequired,
      answerReviewCount: reviewMetrics.answerReviewCount,
    };

    const response: ApiResponse<RunStatusResponse> = {
      success: true,
      data: stub,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs/:id/screening-answers — Get structured screening answers for a run.
 *
 * Returns the answersJson column from apply_runs, which contains per-field
 * structured answer entries logged during the screening state.
 *
 * Falls back to an empty object when DB is not wired or run is not found.
 */
runsRouter.get("/:id/screening-answers", async (req, res, next) => {
  try {
    const { id } = req.params;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (prismaClient) {
      const run = await prismaClient.applyRun.findUnique({
        where: { id },
        select: { answersJson: true, candidateId: true, outcome: true },
      });
      if (!run) throw ApiError.notFound("Run", id);
      const metrics = deriveAnswerReviewMetrics(run.answersJson ?? null);
      const response: ApiResponse<{
        answersJson: unknown;
        candidateId: string;
        outcome: string | null;
        answerReviewRequired: boolean;
        answerReviewCount: number;
      }> = {
        success: true,
        data: {
          answersJson: run.answersJson ?? {},
          candidateId: run.candidateId,
          outcome: run.outcome,
          answerReviewRequired: metrics.answerReviewRequired,
          answerReviewCount: metrics.answerReviewCount,
        },
      };
      return res.json(response);
    }

    res.json({
      success: true,
      data: {
        answersJson: {},
        candidateId: "",
        outcome: null,
        answerReviewRequired: false,
        answerReviewCount: 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/runs/:id/screening-answers/approve — Approve (and optionally edit)
 * screening answers, writing them into the candidate's answer bank.
 *
 * Body: { answers: Array<{ question, answer, source?, confidence? }> }
 *
 * Each approved answer is merged into candidates.answer_bank_json using
 * persistAnswerBank. This is the operator-in-the-loop gate that converts
 * run-level answers into reusable candidate knowledge.
 */
runsRouter.post("/:id/screening-answers/approve", async (req, res, next) => {
  try {
    const { id } = req.params;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (!prismaClient) {
      return res.json({
        success: true,
        data: { approved: 0 },
        message: "DB not connected — answers not persisted.",
      });
    }

    const run = await prismaClient.applyRun.findUnique({
      where: { id },
      select: { candidateId: true },
    });
    if (!run) throw ApiError.notFound("Run", id);

    const body = req.body as {
      answers: Array<{
        question: string;
        answer: string;
        source?: string;
        confidence?: number;
      }>;
    };

    if (!body.answers || !Array.isArray(body.answers) || body.answers.length === 0) {
      throw ApiError.badRequest("answers array is required and must not be empty");
    }

    const bankEntries: AnswerBank = {};
    for (const a of body.answers) {
      const normKey = a.question.toLowerCase().replace(/[*:?\s]+/g, " ").trim();
      const entry: AnswerBankEntry = {
        question: a.question,
        answer: a.answer,
        source: (a.source === "rule" || a.source === "generated" || a.source === "captured" || a.source === "manual")
          ? a.source
          : "manual",
        confidence: a.confidence ?? 1.0,
        lastUsed: new Date().toISOString(),
      };
      bankEntries[normKey] = entry;
    }

    const merged = await persistAnswerBank(run.candidateId, bankEntries, prismaClient);

    const response: ApiResponse<{ approved: number; bankSize: number }> = {
      success: true,
      data: { approved: body.answers.length, bankSize: Object.keys(merged).length },
      message: `${body.answers.length} answer(s) approved and written to candidate answer bank.`,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/runs/:id/verification-code — Submit the Greenhouse security code.
 *
 * Accepts the 8-character verification code that Greenhouse emailed to the
 * candidate.  When a Temporal client is wired, sends verificationCodeSignal
 * to the workflow, which then enters "awaiting_verification" phase and calls
 * enterVerificationCodeActivity to complete the submission.
 *
 * Without Temporal (dev / standalone), acknowledges receipt so the operator
 * can use the code manually via the job application URL.
 */
runsRouter.post("/:id/verification-code", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body as Partial<VerificationCodeBody>;

    const rawCode = (body.code ?? "").toString().trim().replace(/\s/g, "");
    if (!rawCode || rawCode.length < 4) {
      throw ApiError.badRequest(
        "code is required and must be at least 4 alphanumeric characters",
      );
    }
    const code = rawCode.slice(0, 10); // truncate to max 10 chars for safety

    const temporalClient = req.app.locals.temporalClient as TemporalClientWrapper | undefined;

    if (temporalClient) {
      await temporalClient.signalVerificationCode(id, code);
      const response: ApiResponse<{ runId: string; signalSent: boolean }> = {
        success: true,
        data: { runId: id, signalSent: true },
        message: "Verification code sent to workflow — submission in progress.",
      };
      return res.json(response);
    }

    // No Temporal client — acknowledge receipt, operator completes manually.
    const response: ApiResponse<{ runId: string; signalSent: boolean }> = {
      success: true,
      data: { runId: id, signalSent: false },
      message: "Code received. Open the job application URL and enter it manually.",
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

