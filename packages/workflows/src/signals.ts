import { defineSignal } from "@temporalio/workflow";

/**
 * Payload sent when a human reviewer approves or rejects the pre-submit review.
 */
export interface ReviewApprovalPayload {
  approved: boolean;
  /** Optional field-level edits the reviewer wants applied before submit. */
  edits?: Record<string, string>;
  /** Optional reviewer note for audit trail. */
  reviewerNote?: string;
}

/**
 * Signal sent to the apply workflow to approve or reject submission
 * during REVIEW_BEFORE_SUBMIT mode.
 *
 * The workflow blocks at the pre-submit gate until this signal is received
 * or the 24-hour timeout expires.
 */
export const reviewApprovalSignal = defineSignal<[ReviewApprovalPayload]>(
  "reviewApproval",
);

/**
 * Signal to request cancellation of the workflow.
 */
export interface CancelRequestPayload {
  reason: string;
}

export const cancelRequestSignal = defineSignal<[CancelRequestPayload]>(
  "cancelRequest",
);
