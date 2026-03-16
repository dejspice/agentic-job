import { Router } from "express";
import { RunMode, RunOutcome } from "@dejsol/core";
import { ApiError } from "../middleware/error-handler.js";
import type {
  StartRunBody,
  RunListQuery,
  ApiResponse,
  RunListResponse,
  RunStatusResponse,
} from "../types.js";
import type { ApplyRun } from "@dejsol/core";

export const runsRouter = Router();

/**
 * POST /api/runs — Start a new apply run (triggers the Temporal workflow).
 *
 * Validates the payload, creates a run record, and starts the
 * applyWorkflow via the Temporal client.
 */
runsRouter.post("/", (req, res, next) => {
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

    // Stub: In production, this will:
    // 1. Verify job and candidate records exist
    // 2. Create an ApplyRun record in the database
    // 3. Start the Temporal applyWorkflow with ApplyWorkflowInput
    // 4. Return the run ID and workflow handle

    const runId = crypto.randomUUID();

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
      message: "Run started successfully",
    };
    res.status(201).json(response);
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
 * In production, this queries the Temporal workflow via the
 * workflowStatusQuery and progressQuery handles.
 */
runsRouter.get("/:id/status", (req, res, next) => {
  try {
    const { id } = req.params;

    // Stub: In production, this will:
    // 1. Look up the Temporal workflow execution by run ID
    // 2. Query workflowStatusQuery for current state, phase, errors
    // 3. Query progressQuery for completion percentage
    // 4. Return a combined status response

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
