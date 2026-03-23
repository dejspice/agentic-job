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
} from "../types.js";
import type { ApplyRun } from "@dejsol/core";
import type { TemporalClientWrapper } from "../temporal-client.js";
import type { PrismaClient } from "@prisma/client";
import { queryVerificationRuns, computeKpiSnapshot } from "../persistence.js";
import type { KpiResponse } from "../types.js";

export const runsRouter = Router();

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
 */
runsRouter.get("/", (req, res, next) => {
  try {
    const query = req.query as RunListQuery;
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);

    if (query.outcome && !Object.values(RunOutcome).includes(query.outcome)) {
      throw ApiError.badRequest(`Invalid outcome filter: ${query.outcome}`);
    }

    // Stub: In production, query the database with filters
    const response: RunListResponse = {
      success: true,
      data: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs/:id — Get a single apply run.
 */
runsRouter.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // Stub: In production, look up by ID in the database
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

