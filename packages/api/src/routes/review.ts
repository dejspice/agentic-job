import { Router } from "express";
import { ApiError } from "../middleware/error-handler.js";
import type {
  ReviewQueueQuery,
  ReviewDecisionBody,
  ReviewDetailResponse,
  ApiResponse,
  ReviewQueueResponse,
} from "../types.js";

export const reviewRouter = Router();

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
reviewRouter.get("/:runId", (req, res, next) => {
  try {
    const { runId } = req.params;

    // Stub: In production, this will:
    // 1. Look up the run record
    // 2. Query the Temporal workflow for current state/data
    // 3. Return form data, screenshots, and approval context

    throw ApiError.notFound("Review item", runId);
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
reviewRouter.post("/:runId/approve", (req, res, next) => {
  try {
    const { runId } = req.params;
    const body = req.body as Partial<ReviewDecisionBody>;

    // Stub: In production, this will:
    // 1. Verify the run exists and is in waiting_review state
    // 2. Send reviewApprovalSignal to the Temporal workflow
    //    with { approved: true, edits: body.edits, reviewerNote: body.reviewerNote }
    // 3. Return success

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
reviewRouter.post("/:runId/reject", (req, res, next) => {
  try {
    const { runId } = req.params;
    const body = req.body as Partial<ReviewDecisionBody>;

    if (!body.reviewerNote) {
      throw ApiError.badRequest("reviewerNote is required when rejecting");
    }

    // Stub: In production, this will:
    // 1. Verify the run exists and is in waiting_review state
    // 2. Send reviewApprovalSignal to the Temporal workflow
    //    with { approved: false, reviewerNote: body.reviewerNote }
    // 3. Return success

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
