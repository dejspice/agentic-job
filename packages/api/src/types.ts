import type {
  AtsType,
  RunMode,
  RunOutcome,
  JobStatus,
  StateName,
  JobOpportunity,
  ApplyRun,
  Candidate,
  AtsAccelerator,
} from "@dejsol/core";

// --- Shared API envelope ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// --- Jobs ---

export interface IngestJobBody {
  candidateId: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  atsType: AtsType;
  location?: string;
  compensation?: {
    salary?: string;
    min?: number;
    max?: number;
    currency?: string;
  };
  requirements?: {
    yearsOfExperience?: number;
    education?: string;
    skills?: string[];
  };
}

export interface JobListQuery {
  candidateId?: string;
  status?: JobStatus;
  atsType?: AtsType;
  page?: string;
  pageSize?: string;
}

export type JobResponse = ApiResponse<JobOpportunity>;
export type JobListResponse = PaginatedResponse<JobOpportunity>;

// --- Runs ---

export interface StartRunBody {
  jobId: string;
  candidateId: string;
  mode: RunMode;
  resumeFile?: string;
  /**
   * Job URL passed directly by the caller.
   * In production the API looks this up from the jobs table via jobId.
   * Accepted here so tests and direct callers can start a workflow without
   * requiring a populated database.
   */
  jobUrl?: string;
  /**
   * ATS type passed directly by the caller.
   * Same rationale as jobUrl: allows workflow start without a DB lookup.
   */
  atsType?: AtsType;
}

export interface RunListQuery {
  jobId?: string;
  candidateId?: string;
  outcome?: RunOutcome;
  page?: string;
  pageSize?: string;
}

export type RunResponse = ApiResponse<ApplyRun>;
export type RunListResponse = PaginatedResponse<ApplyRun>;

export interface RunStatusResponse {
  runId: string;
  currentState: StateName | null;
  phase: string;
  statesCompleted: StateName[];
  percentComplete: number;
  /**
   * True iff any screeningAnswers entry on this run has an adjudication
   * recommendation of "human_review_required" or "reject" — i.e. an operator
   * must approve or reject the answer before it is banked.
   */
  answerReviewRequired?: boolean;
  /** Count of screeningAnswers entries flagged as needing review or rejected. */
  answerReviewCount?: number;
}

// --- Candidates ---

export interface CandidateListQuery {
  page?: string;
  pageSize?: string;
}

export interface CreateCandidateBody {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface UpdateCandidateBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
}

export type CandidateResponse = ApiResponse<Candidate>;
export type CandidateListResponse = PaginatedResponse<Candidate>;

// --- Drive Sync ---

export interface TriggerSyncBody {
  candidateId: string;
  sheetId?: string;
}

export interface SyncStatusResponse {
  candidateId: string;
  status: "idle" | "syncing" | "completed" | "failed";
  lastSyncedAt: string | null;
  rowsSynced: number;
  error?: string;
}

// --- Accelerators ---

export type AcceleratorResponse = ApiResponse<AtsAccelerator>;
export type AcceleratorListResponse = ApiResponse<
  Array<{ atsType: AtsType; version: number; successRate: number | null }>
>;

// --- KPI ---

export type KpiPeriod = "24h" | "7d" | "30d";

/** A single computed KPI value with period-over-period comparison. */
export interface KpiValue {
  current: number;
  previous: number;
  /** Percentage change relative to the previous period (+ve = increase). */
  delta?: number;
  /** Pre-formatted display string (e.g. "84.2%", "$4.82", "3.2 min"). */
  formatted: string;
}

/**
 * Full KPI snapshot for one observation period.
 * Shape is intentionally identical to KpiSnapshot in packages/console/src/types.ts
 * so the console can deserialise the API response directly.
 */
export interface KpiSnapshot {
  period: KpiPeriod;
  generatedAt: string;
  successRate: KpiValue;
  hitlRate: KpiValue;
  llmCostUsd: KpiValue;
  deterministicRate: KpiValue;
  totalRuns: KpiValue;
  submittedRuns: KpiValue;
  failedRuns: KpiValue;
  verificationRequiredRuns: KpiValue;
  avgRunDurationSec: KpiValue;
  reviewPendingCount: number;
}

export type KpiResponse = ApiResponse<KpiSnapshot>;

// --- Verification Required ---

/**
 * A run that submitted successfully but is gated behind an email
 * verification code.  Surfaced so an operator can identify and
 * manually complete the code-entry step.
 */
export interface VerificationQueueItem {
  runId: string;
  jobId: string;
  candidateId: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  completedAt: string;
  /** URL of the post-submit screenshot showing the security-code form. */
  postSubmitScreenshotUrl?: string;
}

export type VerificationQueueResponse = ApiResponse<VerificationQueueItem[]>;

/**
 * Request body for POST /api/runs/:id/verification-code.
 * Operator supplies the security code that Greenhouse emailed to the candidate.
 */
export interface VerificationCodeBody {
  code: string;
}

// --- Review ---

export interface ReviewQueueQuery {
  candidateId?: string;
  page?: string;
  pageSize?: string;
}

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

export type ReviewQueueResponse = PaginatedResponse<ReviewQueueItem>;

export interface ReviewDecisionBody {
  approved: boolean;
  edits?: Record<string, string>;
  reviewerNote?: string;
}

export interface ReviewDetailResponse {
  runId: string;
  jobId: string;
  candidateId: string;
  company: string;
  jobTitle: string;
  currentState: StateName | null;
  statesCompleted: StateName[];
  formData: Record<string, unknown>;
  screenshotUrls: string[];
}
