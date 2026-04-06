// Server
export { createApp, startServer } from "./server.js";
export type { ServerConfig } from "./server.js";

// Temporal client
export {
  TemporalClientWrapper,
  getRunWorkflowId,
  SIGNAL_NAMES,
  QUERY_NAMES,
  TASK_QUEUE,
} from "./temporal-client.js";
export type { TemporalConfig } from "./temporal-client.js";

// Middleware
export { errorHandler, ApiError } from "./middleware/error-handler.js";
export { requestLogging } from "./middleware/request-logging.js";

// Route modules
export { jobsRouter } from "./routes/jobs.js";
export { runsRouter } from "./routes/runs.js";
export { candidatesRouter } from "./routes/candidates.js";
export { driveSyncRouter } from "./routes/drive-sync.js";
export { acceleratorsRouter } from "./routes/accelerators.js";
export { reviewRouter } from "./routes/review.js";

// Workflow → API mappers
export {
  workflowStatusToRunStatus,
  workflowStatusToReviewPartial,
  extractWorkflowErrors,
} from "./mappers.js";

// Workflow result persistence + DB queries
export { persistRunResult, loadAnswerBank, persistAnswerBank, queryVerificationRuns, computeKpiSnapshot, buildKpiSnapshot } from "./persistence.js";
export type { RunResultPayload, KpiRunRow } from "./persistence.js";

// API types
export type {
  ApiResponse,
  PaginatedResponse,
  IngestJobBody,
  JobListQuery,
  JobResponse,
  JobListResponse,
  StartRunBody,
  RunListQuery,
  RunResponse,
  RunListResponse,
  RunStatusResponse,
  CandidateListQuery,
  CandidateResponse,
  CandidateListResponse,
  TriggerSyncBody,
  SyncStatusResponse,
  AcceleratorResponse,
  AcceleratorListResponse,
  ReviewQueueQuery,
  ReviewQueueItem,
  ReviewQueueResponse,
  ReviewDecisionBody,
  ReviewDetailResponse,
  VerificationQueueItem,
  VerificationQueueResponse,
  KpiPeriod,
  KpiValue,
  KpiSnapshot,
  KpiResponse,
} from "./types.js";
