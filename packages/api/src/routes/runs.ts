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
 * Enrich a raw run record with computed fields for external consumers.
 * Does not mutate the input — returns a new object.
 */
function withComputedFields<T extends { outcome?: string | null }>(
  run: T,
): T & { actionRequired: boolean } {
  const outcome = run.outcome ?? null;
  const actionRequired =
    outcome === "VERIFICATION_REQUIRED" || outcome === "ESCALATED";
  return { ...run, actionRequired };
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

    // Attempt to start the Temporal workflow when the client is wired and
    // sufficient information is available (jobUrl + atsType).
    const temporalClient = req.app.locals.temporalClient as TemporalClientWrapper | undefined;

    if (temporalClient && body.jobUrl && body.atsType) {
      try {
        await temporalClient.startWorkflow(runId, {
          runId,
          jobId: body.jobId,
          candidateId: body.candidateId,
          jobUrl: body.jobUrl,
          mode: body.mode,
          atsType: body.atsType,
          resumeFile: body.resumeFile ?? null,
        });
      } catch (workflowErr) {
        // Log but do not fail the API request — the run record is still
        // created so the caller has a runId to poll for status.
        console.error("[api/runs] Failed to start Temporal workflow:", workflowErr);
      }
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

    const response: ApiResponse<ApplyRun> = {
      success: true,
      data: stub,
      message: temporalClient && body.jobUrl && body.atsType
        ? "Run started and workflow triggered"
        : "Run started successfully",
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
      const response: ApiResponse<{ answersJson: unknown; candidateId: string; outcome: string | null }> = {
        success: true,
        data: {
          answersJson: run.answersJson ?? {},
          candidateId: run.candidateId,
          outcome: run.outcome,
        },
      };
      return res.json(response);
    }

    res.json({ success: true, data: { answersJson: {}, candidateId: "", outcome: null } });
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

