import { Router } from "express";
import { ApiError } from "../middleware/error-handler.js";
import type {
  TriggerSyncBody,
  SyncStatusResponse,
  ApiResponse,
} from "../types.js";

export const driveSyncRouter = Router();

/**
 * POST /api/drive-sync/trigger — Trigger a tracking-sheet sync for a candidate.
 *
 * Syncs the candidate's job statuses from Postgres → Google Sheet.
 * Direction is primarily DB → Sheet (Postgres is source of truth).
 */
driveSyncRouter.post("/trigger", (req, res, next) => {
  try {
    const body = req.body as TriggerSyncBody;

    if (!body.candidateId) {
      throw ApiError.badRequest("Missing required field: candidateId");
    }

    // Stub: In production, this will:
    // 1. Look up the candidate's trackingSheetId
    // 2. Load all jobs/runs for the candidate
    // 3. Call syncJobsToSheet from drive-connector
    // 4. Return sync result summary

    const response: ApiResponse<{ syncId: string }> = {
      success: true,
      data: { syncId: crypto.randomUUID() },
      message: "Sync triggered",
    };
    res.status(202).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/drive-sync/status/:candidateId — Get sync status for a candidate.
 */
driveSyncRouter.get("/status/:candidateId", (req, res, next) => {
  try {
    const { candidateId } = req.params;

    // Stub: In production, look up last sync state from cache/DB
    const stub: SyncStatusResponse = {
      candidateId,
      status: "idle",
      lastSyncedAt: null,
      rowsSynced: 0,
    };

    const response: ApiResponse<SyncStatusResponse> = {
      success: true,
      data: stub,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/drive-sync/batch — Trigger sync for multiple candidates.
 */
driveSyncRouter.post("/batch", (req, res, next) => {
  try {
    const body = req.body as { candidateIds: string[] };

    if (!body.candidateIds || !Array.isArray(body.candidateIds) || body.candidateIds.length === 0) {
      throw ApiError.badRequest("Missing or empty candidateIds array");
    }

    // Stub: In production, queue sync jobs for each candidate
    const response: ApiResponse<{ queued: number }> = {
      success: true,
      data: { queued: body.candidateIds.length },
      message: "Batch sync queued",
    };
    res.status(202).json(response);
  } catch (err) {
    next(err);
  }
});
