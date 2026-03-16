import { StateName } from "../enums/state-name.js";
import { JobStatus } from "../enums/job-status.js";

/** Ordered sequence of apply workflow states. */
export const STATE_ORDER: readonly StateName[] = [
  StateName.INIT,
  StateName.OPEN_JOB_PAGE,
  StateName.DETECT_APPLY_ENTRY,
  StateName.LOGIN_OR_CONTINUE,
  StateName.UPLOAD_RESUME,
  StateName.WAIT_FOR_PARSE,
  StateName.VALIDATE_PARSED_PROFILE,
  StateName.FILL_REQUIRED_FIELDS,
  StateName.ANSWER_SCREENING_QUESTIONS,
  StateName.REVIEW_DISCLOSURES,
  StateName.PRE_SUBMIT_CHECK,
  StateName.SUBMIT,
  StateName.CAPTURE_CONFIRMATION,
  StateName.ESCALATE,
] as const;

/** States that end the workflow — no further transitions. */
export const TERMINAL_STATES: ReadonlySet<StateName> = new Set([
  StateName.CAPTURE_CONFIRMATION,
  StateName.ESCALATE,
]);

/** States that require a screenshot on entry. */
export const SCREENSHOT_REQUIRED_STATES: ReadonlySet<StateName> = new Set([
  StateName.PRE_SUBMIT_CHECK,
  StateName.SUBMIT,
]);

/** States that require a DOM snapshot on entry. */
export const DOM_SNAPSHOT_REQUIRED_STATES: ReadonlySet<StateName> = new Set([
  StateName.FILL_REQUIRED_FIELDS,
  StateName.ANSWER_SCREENING_QUESTIONS,
]);

/** Job statuses that trigger a tracking sheet update. */
export const CHECKPOINT_STATUSES: ReadonlySet<JobStatus> = new Set([
  JobStatus.IN_PROGRESS,
  JobStatus.REVIEW,
  JobStatus.SUBMITTED,
  JobStatus.FAILED,
  JobStatus.SKIPPED,
]);
