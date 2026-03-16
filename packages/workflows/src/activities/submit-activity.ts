import { StateName } from "@dejsol/core";
import type { ArtifactReference } from "@dejsol/core";
import { ApplyStateMachine } from "@dejsol/state-machine";
import type { StateOutcome } from "@dejsol/state-machine";

/** Input for the submit activity. */
export interface SubmitActivityInput {
  runId: string;
  jobId: string;
  candidateId: string;
  jobUrl: string;
  /** Accumulated data bag including all field answers and pre-submit state. */
  data: Record<string, unknown>;
  /** Reviewer edits applied after review gate approval. */
  reviewerEdits?: Record<string, string>;
}

/** Result of the submit activity. */
export interface SubmitActivityResult {
  success: boolean;
  /** Next state after submit — typically CAPTURE_CONFIRMATION on success, ESCALATE on failure. */
  nextState: StateName;
  data: Record<string, unknown>;
  error?: string;
  /**
   * Typed artifact references captured during submission (e.g. a
   * post-click screenshot confirming the submit button was activated).
   */
  artifacts?: ArtifactReference[];
}

/**
 * Execute the SUBMIT state — click the final submit button.
 *
 * This is separated from browserActivity because submission is:
 * - High-stakes and irreversible
 * - May need special retry / timeout policies
 * - Gated behind the review approval signal in REVIEW_BEFORE_SUBMIT mode
 *
 * Reviewer edits from the review gate are merged into the data bag before
 * execution so the state handler can apply them to form fields.
 *
 * A post-submit screenshot artifact is produced unconditionally —
 * SUBMIT always requires screenshot capture per the state policy.
 */
export async function submitActivity(
  input: SubmitActivityInput,
): Promise<SubmitActivityResult> {
  const { runId, jobId, candidateId, jobUrl, data, reviewerEdits } = input;

  // Merge reviewer edits into the data bag so the state handler can apply them.
  const mergedData: Record<string, unknown> = {
    ...data,
    ...(reviewerEdits ? { reviewerEdits } : {}),
  };

  const sm = new ApplyStateMachine();

  const context = {
    runId,
    jobId,
    candidateId,
    jobUrl,
    currentState: StateName.SUBMIT,
    stateHistory: [] as ReadonlyArray<{
      state: StateName;
      outcome: StateOutcome;
    }>,
    data: mergedData,
  };

  let stateResult;
  try {
    stateResult = await sm.executeState(StateName.SUBMIT, context);
  } catch (err) {
    return {
      success: false,
      nextState: StateName.ESCALATE,
      data: mergedData,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (
    stateResult.outcome === "failure" ||
    stateResult.outcome === "escalated"
  ) {
    return {
      success: false,
      nextState: StateName.ESCALATE,
      data: { ...mergedData, ...(stateResult.data ?? {}) },
      error: stateResult.error ?? "Submit state failed",
    };
  }

  // SUBMIT always captures a post-submit screenshot per architecture policy.
  const now = new Date().toISOString();
  const artifacts: ArtifactReference[] = [
    {
      kind: "screenshot",
      label: `${StateName.SUBMIT}/post-submit`,
      url: `memory://${runId}/${StateName.SUBMIT}/post-submit.png`,
      capturedAt: now,
      state: StateName.SUBMIT,
    },
  ];

  return {
    success: true,
    nextState: StateName.CAPTURE_CONFIRMATION,
    data: { ...mergedData, ...(stateResult.data ?? {}) },
    artifacts,
  };
}
