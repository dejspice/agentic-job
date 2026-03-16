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
}

// --- Candidates ---

export interface CandidateListQuery {
  page?: string;
  pageSize?: string;
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
