import type { AtsType, RunMode, StateName } from "@dejsol/core";

/** Input for the init activity — everything needed to bootstrap a run. */
export interface InitActivityInput {
  runId: string;
  jobId: string;
  candidateId: string;
  jobUrl: string;
  mode: RunMode;
  atsType: AtsType;
  resumeFile?: string;
}

/** Result of the init activity. */
export interface InitActivityResult {
  success: boolean;
  /** First state to execute after init (typically OPEN_JOB_PAGE). */
  nextState: StateName;
  /** Shared data bag seeded during init, carried through the run. */
  data: Record<string, unknown>;
  error?: string;
}

/**
 * Initialize the apply workflow run.
 *
 * Responsibilities (to be wired in later phases):
 * - Validate that the job, candidate, and run records exist
 * - Load candidate profile and answer bank
 * - Load accelerator pack and portal fingerprint for the ATS type
 * - Prepare the initial state context data bag
 * - Mark the run as IN_PROGRESS
 *
 * Returns the first actionable state and the seeded data bag.
 */
export async function initActivity(
  input: InitActivityInput,
): Promise<InitActivityResult> {
  const { runId, jobId, candidateId, jobUrl, mode, atsType } = input;

  if (!runId || !jobId || !candidateId || !jobUrl) {
    return {
      success: false,
      nextState: "ESCALATE" as StateName,
      data: {},
      error: "Missing required input fields for init",
    };
  }

  return {
    success: true,
    nextState: "OPEN_JOB_PAGE" as StateName,
    data: {
      runId,
      jobId,
      candidateId,
      jobUrl,
      mode,
      atsType,
      resumeFile: input.resumeFile ?? null,
      initializedAt: new Date().toISOString(),
    },
  };
}
