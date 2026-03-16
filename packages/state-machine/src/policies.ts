import { StateName } from "@dejsol/core";
import type { StatePolicy } from "@dejsol/core";

/**
 * Centralized policy configuration for all 14 apply workflow states.
 *
 * Rules enforced from ARCHITECTURE.MD:
 * - SUBMIT and PRE_SUBMIT_CHECK always require screenshots.
 * - FILL_REQUIRED_FIELDS and ANSWER_SCREENING_QUESTIONS require DOM snapshots.
 * - ESCALATE is terminal: maxRetries must be 0.
 * - Every state must be explicitly configured here.
 */
export const STATE_POLICIES: Record<StateName, StatePolicy> = {
  [StateName.INIT]: {
    maxRetries: 2,
    timeoutSeconds: 15,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.5,
  },

  [StateName.OPEN_JOB_PAGE]: {
    maxRetries: 3,
    timeoutSeconds: 30,
    retryBackoff: "EXPONENTIAL",
    onFailure: "RETRY",
    onTimeout: "RETRY",
    requiresScreenshot: true,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.7,
    humanReviewTrigger: "Job page failed to load after maximum retries",
  },

  [StateName.DETECT_APPLY_ENTRY]: {
    maxRetries: 3,
    timeoutSeconds: 30,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.7,
    humanReviewTrigger: "Apply entry point not detected with sufficient confidence",
  },

  [StateName.LOGIN_OR_CONTINUE]: {
    maxRetries: 2,
    timeoutSeconds: 60,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.8,
    humanReviewTrigger: "Login required or auth challenge detected",
  },

  [StateName.UPLOAD_RESUME]: {
    maxRetries: 3,
    timeoutSeconds: 60,
    retryBackoff: "EXPONENTIAL",
    onFailure: "RETRY",
    onTimeout: "RETRY",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.7,
  },

  [StateName.WAIT_FOR_PARSE]: {
    maxRetries: 2,
    timeoutSeconds: 120,
    retryBackoff: "LINEAR",
    onFailure: "RETRY",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.6,
    humanReviewTrigger: "Resume parse timed out or parse confidence insufficient",
  },

  [StateName.VALIDATE_PARSED_PROFILE]: {
    maxRetries: 2,
    timeoutSeconds: 30,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.8,
    humanReviewTrigger: "Parsed profile confidence below threshold",
  },

  [StateName.FILL_REQUIRED_FIELDS]: {
    maxRetries: 3,
    timeoutSeconds: 120,
    retryBackoff: "EXPONENTIAL",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: true,
    confidenceThreshold: 0.85,
    humanReviewTrigger: "Required field cannot be mapped to candidate profile",
  },

  [StateName.ANSWER_SCREENING_QUESTIONS]: {
    maxRetries: 2,
    timeoutSeconds: 120,
    retryBackoff: "EXPONENTIAL",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: true,
    confidenceThreshold: 0.75,
    humanReviewTrigger: "Screening question answer confidence below threshold",
  },

  [StateName.REVIEW_DISCLOSURES]: {
    maxRetries: 2,
    timeoutSeconds: 30,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.8,
    humanReviewTrigger: "Unrecognized disclosure or legal agreement detected",
  },

  [StateName.PRE_SUBMIT_CHECK]: {
    maxRetries: 2,
    timeoutSeconds: 45,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: true,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.9,
    humanReviewTrigger: "Pre-submit validation confidence below threshold",
  },

  [StateName.SUBMIT]: {
    maxRetries: 1,
    timeoutSeconds: 60,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: true,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.95,
    humanReviewTrigger: "Submission failed or confirmation page not detected",
  },

  [StateName.CAPTURE_CONFIRMATION]: {
    maxRetries: 2,
    timeoutSeconds: 30,
    retryBackoff: "LINEAR",
    onFailure: "SKIP_STATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.7,
  },

  [StateName.ESCALATE]: {
    maxRetries: 0,
    timeoutSeconds: 60,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 1.0,
    humanReviewTrigger: "Human review required",
  },
};
