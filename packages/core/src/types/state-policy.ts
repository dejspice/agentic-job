export interface StatePolicy {
  maxRetries: number;
  timeoutSeconds: number;
  retryBackoff: "LINEAR" | "EXPONENTIAL";
  onFailure: "RETRY" | "SKIP_STATE" | "ESCALATE";
  onTimeout: "RETRY" | "ESCALATE";
  requiresScreenshot: boolean;
  requiresDomSnapshot: boolean;
  confidenceThreshold: number;
  humanReviewTrigger?: string;
}
