import type { StateName, ArtifactReference } from "@dejsol/core";

/** Input for the capture activity. */
export interface CaptureActivityInput {
  runId: string;
  jobId: string;
  candidateId: string;
  jobUrl: string;
  /** Data bag including submit result state. */
  data: Record<string, unknown>;
}

/** Result of the capture activity. */
export interface CaptureActivityResult {
  success: boolean;
  /** Extracted confirmation ID / application number, if available. */
  confirmationId?: string;
  data: Record<string, unknown>;
  error?: string;
  /**
   * Typed artifact references from the post-submit confirmation page
   * (confirmation screenshot, HAR for network audit, etc.).
   */
  artifacts?: ArtifactReference[];
}

/**
 * Execute the CAPTURE_CONFIRMATION state — extract confirmation after submit.
 *
 * This is separated from browserActivity because post-submit capture:
 * - Has its own retry semantics (the application is already submitted)
 * - Captures the confirmation ID for tracking
 * - Takes a final screenshot for audit
 * - Updates artifact storage
 *
 * Responsibilities (to be wired in later phases):
 * - Read the confirmation page
 * - Extract confirmation ID / application number
 * - Capture final screenshot
 * - Release the browser session
 * - Store artifacts to S3/GCS
 */
export async function captureActivity(
  input: CaptureActivityInput,
): Promise<CaptureActivityResult> {
  const { runId, data } = input;

  // Stub: In production, this will:
  // 1. Execute the CAPTURE_CONFIRMATION state handler
  // 2. Extract confirmation ID from the page
  // 3. Capture final screenshot
  // 4. Release browser session
  // 5. Upload artifacts

  throw new Error(
    `captureActivity not yet implemented for run: ${runId}. ` +
      `Data keys: [${Object.keys(data).join(", ")}]`,
  );
}
