import { Router } from "express";
import { ApiError } from "../middleware/error-handler.js";
import type { TemporalClientWrapper } from "../temporal-client.js";
import type {
  ReviewQueueQuery,
  ReviewDecisionBody,
  ReviewDetailResponse,
  ApiResponse,
  ReviewQueueResponse,
} from "../types.js";

export const reviewRouter = Router();

/**
 * Extract the Temporal client from app.locals.
 * Throws 503 if Temporal is not connected.
 */
function requireTemporalClient(locals: Record<string, unknown>): TemporalClientWrapper {
  const client = locals.temporalClient as TemporalClientWrapper | undefined;
  if (!client) {
    throw new ApiError(
      503,
      "Temporal client not available — review signaling is disabled",
    );
  }
  return client;
}

/**
 * GET /api/review/queue — Get the pending review queue.
 *
 * Lists runs that are in REVIEW_BEFORE_SUBMIT mode and waiting
 * at the review gate (workflow phase = "waiting_review").
 */
reviewRouter.get("/queue", (req, res, next) => {
  try {
    const query = req.query as ReviewQueueQuery;
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);

    // Stub: In production, this will:
    // 1. Query runs with mode=REVIEW_BEFORE_SUBMIT and waiting status
    // 2. Optionally query Temporal for live workflow state
    // 3. Return the review queue with job/candidate context

    const response: ReviewQueueResponse = {
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
 * GET /api/review/:runId — Get review details for a specific run.
 *
 * Returns the run state, form data snapshot, screenshots, and other
 * context needed for a reviewer to make an approval decision.
 */
reviewRouter.get("/:runId", async (req, res, next) => {
  try {
    const { runId } = req.params;
    const temporal = requireTemporalClient(req.app.locals);

    const status = await temporal.queryWorkflowStatus(runId);

    const response: ApiResponse<{ runId: string; workflowStatus: unknown }> = {
      success: true,
      data: { runId, workflowStatus: status },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/review/:runId/approve — Approve a pending review.
 *
 * Sends the reviewApprovalSignal to the Temporal workflow with
 * approved=true and optional field edits.
 */
reviewRouter.post("/:runId/approve", async (req, res, next) => {
  try {
    const { runId } = req.params;
    const body = req.body as Partial<ReviewDecisionBody>;
    const temporal = requireTemporalClient(req.app.locals);

    const decision: ReviewDecisionBody = {
      approved: true,
      edits: body.edits,
      reviewerNote: body.reviewerNote,
    };

    await temporal.signalReviewApproval(runId, decision);

    const response: ApiResponse<{ runId: string; decision: "approved" }> = {
      success: true,
      data: { runId, decision: "approved" },
      message: `Review approved for run ${runId}`,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/review/:runId/reject — Reject a pending review.
 *
 * Sends the reviewApprovalSignal to the Temporal workflow with
 * approved=false, which causes the workflow to return CANCELLED.
 */
reviewRouter.post("/:runId/reject", async (req, res, next) => {
  try {
    const { runId } = req.params;
    const body = req.body as Partial<ReviewDecisionBody>;

    if (!body.reviewerNote) {
      throw ApiError.badRequest("reviewerNote is required when rejecting");
    }

    const temporal = requireTemporalClient(req.app.locals);

    const decision: ReviewDecisionBody = {
      approved: false,
      reviewerNote: body.reviewerNote,
    };

    await temporal.signalReviewApproval(runId, decision);

    const response: ApiResponse<{ runId: string; decision: "rejected" }> = {
      success: true,
      data: { runId, decision: "rejected" },
      message: `Review rejected for run ${runId}`,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});
