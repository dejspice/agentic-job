import type { StateName, ArtifactReference } from "@dejsol/core";

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
 * Responsibilities (to be wired in later phases):
 * - Apply reviewer edits if present
 * - Execute the submit state handler
 * - Capture a screenshot of the post-submit state
 * - Detect success vs. error conditions
 */
export async function submitActivity(
  input: SubmitActivityInput,
): Promise<SubmitActivityResult> {
  const { runId, data, reviewerEdits } = input;

  // Stub: In production, this will:
  // 1. Reuse the browser session from prior states
  // 2. Apply any reviewer edits to form fields
  // 3. Execute the SUBMIT state handler
  // 4. Capture post-submit screenshot
  // 5. Detect success indicators

  throw new Error(
    `submitActivity not yet implemented for run: ${runId}. ` +
      `Has reviewer edits: ${reviewerEdits !== undefined}. ` +
      `Data keys: [${Object.keys(data).join(", ")}]`,
  );
}
