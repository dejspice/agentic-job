import type { StateName, ArtifactReference } from "@dejsol/core";
import { ApplyStateMachine, STATE_POLICIES } from "@dejsol/state-machine";
import type { StateOutcome } from "@dejsol/state-machine";

/** Input for the browser activity — executes a single state machine state. */
export interface BrowserActivityInput {
  runId: string;
  jobId: string;
  candidateId: string;
  jobUrl: string;
  /** The state to execute. */
  state: StateName;
  /** Accumulated data bag from prior states. */
  data: Record<string, unknown>;
}

/** Result of executing a single state via browser automation. */
export interface BrowserActivityResult {
  outcome: StateOutcome;
  /** Next state to transition to, or null if terminal. */
  nextState: StateName | null;
  /** Updated data bag — merged into the workflow's running context. */
  data: Record<string, unknown>;
  error?: string;
  /**
   * Typed artifact references captured during this state.
   * Populated by the browser-worker once the artifacts have been persisted
   * to the ArtifactStore.  The workflow accumulates these into the
   * RunArtifactBundle carried through the execution.
   */
  artifacts?: ArtifactReference[];
}

/**
 * Execute a single state machine state via browser automation.
 *
 * This implementation uses ApplyStateMachine to execute the registered
 * state handler for the given state.  In this phase the state handlers
 * are deterministic stubs; real Playwright execution will be wired in
 * a later phase via the browser-broker session allocation path.
 *
 * Artifact references are produced based on the state's policy
 * (requiresScreenshot / requiresDomSnapshot).  URLs use the
 * `memory://` scheme as a synthetic placeholder until the S3/GCS
 * ArtifactStore is wired.
 */
export async function browserActivity(
  input: BrowserActivityInput,
): Promise<BrowserActivityResult> {
  const { runId, jobId, candidateId, jobUrl, state, data } = input;

  const sm = new ApplyStateMachine();

  const context = {
    runId,
    jobId,
    candidateId,
    jobUrl,
    currentState: state,
    stateHistory: [] as ReadonlyArray<{ state: StateName; outcome: StateOutcome }>,
    data,
  };

  let stateResult;
  try {
    stateResult = await sm.executeState(state, context);
  } catch (err) {
    return {
      outcome: "failure",
      nextState: null,
      data,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const nextState = sm.resolveNextState(state, stateResult);

  // Produce artifact references according to the state's capture policy.
  const artifacts: ArtifactReference[] = [];
  const policy = STATE_POLICIES[state];
  const now = new Date().toISOString();

  if (policy?.requiresScreenshot) {
    artifacts.push({
      kind: "screenshot",
      label: `${state}/entry`,
      url: `memory://${runId}/${state}/screenshot.png`,
      capturedAt: now,
      state,
    });
  }

  if (policy?.requiresDomSnapshot) {
    artifacts.push({
      kind: "dom_snapshot",
      label: `${state}/fields`,
      url: `memory://${runId}/${state}/dom.html`,
      capturedAt: now,
      state,
    });
  }

  return {
    outcome: stateResult.outcome,
    nextState,
    data: { ...data, ...(stateResult.data ?? {}) },
    ...(stateResult.error ? { error: stateResult.error } : {}),
    artifacts,
  };
}
