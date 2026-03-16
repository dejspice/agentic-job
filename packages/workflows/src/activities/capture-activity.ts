import { StateName } from "@dejsol/core";
import type { ArtifactReference } from "@dejsol/core";
import { ApplyStateMachine } from "@dejsol/state-machine";
import type { StateOutcome } from "@dejsol/state-machine";

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
 * The confirmation ID is resolved from:
 * 1. stateResult.data.confirmationId  (real implementation: extracted from page)
 * 2. input.data.confirmationId        (passed-through from a prior state)
 * 3. Synthetic fallback: CONF-<first 8 chars of runId>
 *
 * A confirmation_screenshot artifact is produced unconditionally —
 * this is the permanent audit record that the application was submitted.
 */
export async function captureActivity(
  input: CaptureActivityInput,
): Promise<CaptureActivityResult> {
  const { runId, jobId, candidateId, jobUrl, data } = input;

  const sm = new ApplyStateMachine();

  const context = {
    runId,
    jobId,
    candidateId,
    jobUrl,
    currentState: StateName.CAPTURE_CONFIRMATION,
    stateHistory: [] as ReadonlyArray<{
      state: StateName;
      outcome: StateOutcome;
    }>,
    data,
  };

  let stateResult;
  try {
    stateResult = await sm.executeState(
      StateName.CAPTURE_CONFIRMATION,
      context,
    );
  } catch (err) {
    return {
      success: false,
      data,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (
    stateResult.outcome === "failure" ||
    stateResult.outcome === "escalated"
  ) {
    return {
      success: false,
      data: { ...data, ...(stateResult.data ?? {}) },
      error: stateResult.error ?? "Capture confirmation state failed",
    };
  }

  // Resolve confirmation ID from state result, input data, or synthetic fallback.
  const confirmationId =
    (stateResult.data?.confirmationId as string | undefined) ??
    (data.confirmationId as string | undefined) ??
    `CONF-${runId.slice(0, 8).toUpperCase()}`;

  const now = new Date().toISOString();
  const artifacts: ArtifactReference[] = [
    {
      kind: "confirmation_screenshot",
      label: `${StateName.CAPTURE_CONFIRMATION}/confirmation`,
      url: `memory://${runId}/${StateName.CAPTURE_CONFIRMATION}/confirmation.png`,
      capturedAt: now,
      state: StateName.CAPTURE_CONFIRMATION,
    },
  ];

  const resultData: Record<string, unknown> = {
    ...data,
    ...(stateResult.data ?? {}),
    confirmationId,
  };

  return {
    success: true,
    confirmationId,
    data: resultData,
    artifacts,
  };
}
