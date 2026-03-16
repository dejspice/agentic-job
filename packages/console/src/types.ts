/**
 * UI data models and domain constants for the operator console.
 *
 * Domain enums are defined here as const objects rather than imported from
 * @dejsol/core.  This keeps the browser bundle free of Node.js-targeted CJS
 * output while preserving the same string values as the backend enums.
 * The string values are the authoritative contract — the names intentionally
 * mirror @dejsol/core so renaming is caught at the type level.
 */

// ---------------------------------------------------------------------------
// Domain constants (browser-safe; values match @dejsol/core enums exactly)
// ---------------------------------------------------------------------------

export const RunMode = {
  FULL_AUTO:            "FULL_AUTO",
  REVIEW_BEFORE_SUBMIT: "REVIEW_BEFORE_SUBMIT",
  HUMAN_TAKEOVER:       "HUMAN_TAKEOVER",
} as const;
export type RunMode = (typeof RunMode)[keyof typeof RunMode];

export const RunOutcome = {
  SUBMITTED: "SUBMITTED",
  FAILED:    "FAILED",
  ESCALATED: "ESCALATED",
  CANCELLED: "CANCELLED",
} as const;
export type RunOutcome = (typeof RunOutcome)[keyof typeof RunOutcome];

export const StateName = {
  INIT:                      "INIT",
  OPEN_JOB_PAGE:             "OPEN_JOB_PAGE",
  DETECT_APPLY_ENTRY:        "DETECT_APPLY_ENTRY",
  LOGIN_OR_CONTINUE:         "LOGIN_OR_CONTINUE",
  UPLOAD_RESUME:             "UPLOAD_RESUME",
  WAIT_FOR_PARSE:            "WAIT_FOR_PARSE",
  VALIDATE_PARSED_PROFILE:   "VALIDATE_PARSED_PROFILE",
  FILL_REQUIRED_FIELDS:      "FILL_REQUIRED_FIELDS",
  ANSWER_SCREENING_QUESTIONS:"ANSWER_SCREENING_QUESTIONS",
  REVIEW_DISCLOSURES:        "REVIEW_DISCLOSURES",
  PRE_SUBMIT_CHECK:          "PRE_SUBMIT_CHECK",
  SUBMIT:                    "SUBMIT",
  CAPTURE_CONFIRMATION:      "CAPTURE_CONFIRMATION",
  ESCALATE:                  "ESCALATE",
} as const;
export type StateName = (typeof StateName)[keyof typeof StateName];

export const AtsType = {
  WORKDAY:        "WORKDAY",
  GREENHOUSE:     "GREENHOUSE",
  LEVER:          "LEVER",
  ASHBY:          "ASHBY",
  ICIMS:          "ICIMS",
  SMARTRECRUITERS:"SMARTRECRUITERS",
  TALEO:          "TALEO",
  SAP:            "SAP",
  CUSTOM:         "CUSTOM",
} as const;
export type AtsType = (typeof AtsType)[keyof typeof AtsType];

export const JobStatus = {
  QUEUED:      "QUEUED",
  IN_PROGRESS: "IN_PROGRESS",
  REVIEW:      "REVIEW",
  SUBMITTED:   "SUBMITTED",
  FAILED:      "FAILED",
  SKIPPED:     "SKIPPED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Unified status type used across badges and filters. */
export type RunStatus = RunOutcome | "IN_PROGRESS" | "REVIEW" | "QUEUED";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardMetric {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  /** Percentage change relative to the previous period. */
  delta?: number;
  trend?: "up" | "down" | "neutral";
}

// ---------------------------------------------------------------------------
// Run list / summary
// ---------------------------------------------------------------------------

export interface RunSummary {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  candidateId: string;
  mode: RunMode;
  outcome: RunOutcome | null;
  currentState: StateName | null;
  percentComplete: number;
  humanInterventions: number;
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Run detail
// ---------------------------------------------------------------------------

export interface StateHistoryEntry {
  state: StateName;
  enteredAt: string;
  exitedAt?: string;
  outcome: "success" | "failure" | "skipped" | "escalated";
  durationMs?: number;
  error?: string;
}

export interface ArtifactUrls {
  screenshots?: Record<string, string>;
  domSnapshots?: Record<string, string>;
  harFile?: string;
  confirmationScreenshot?: string;
}

export interface RunCost {
  inputTokens?: number;
  outputTokens?: number;
  llmCalls?: number;
  totalLatencyMs?: number;
  estimatedCostUsd?: number;
}

export interface RunErrorEntry {
  state: StateName;
  message: string;
  timestamp: string;
  recoverable?: boolean;
}

export interface RunDetailView {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  candidateId: string;
  mode: RunMode;
  outcome: RunOutcome | null;
  currentState: StateName | null;
  percentComplete: number;
  stateHistory: StateHistoryEntry[];
  artifacts: ArtifactUrls;
  cost: RunCost;
  humanInterventions: number;
  startedAt: string;
  completedAt: string | null;
  confirmationId: string | null;
  errors: RunErrorEntry[];
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export interface ReviewQueueItem {
  runId: string;
  jobId: string;
  candidateId: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  currentState: StateName | null;
  mode: RunMode;
  waitingSince: string;
}

export interface ReviewDecision {
  approved: boolean;
  edits?: Record<string, string>;
  reviewerNote?: string;
}

// ---------------------------------------------------------------------------
// Policy config
// ---------------------------------------------------------------------------

export interface PolicyEntry {
  state: StateName;
  maxRetries: number;
  timeoutSeconds: number;
  retryBackoff: "LINEAR" | "EXPONENTIAL";
  onFailure: "RETRY" | "SKIP_STATE" | "ESCALATE";
  onTimeout: "RETRY" | "ESCALATE";
  requiresScreenshot: boolean;
  requiresDomSnapshot: boolean;
  /** 0–1 confidence threshold below which a human-review trigger fires. */
  confidenceThreshold: number;
  humanReviewTrigger?: string;
}
