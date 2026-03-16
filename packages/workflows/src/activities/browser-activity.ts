import type { StateName, ArtifactReference } from "@dejsol/core";
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
 * Responsibilities (to be wired in later phases):
 * - Allocate or reuse a browser session via browser-broker
 * - Instantiate the state machine and execute the given state
 * - Capture screenshots / DOM snapshots per policy
 * - Return the outcome, updated data, and next state
 *
 * Each call to this activity represents one state execution.
 * The workflow calls this in a loop, advancing through states.
 */
export async function browserActivity(
  input: BrowserActivityInput,
): Promise<BrowserActivityResult> {
  const { state, data } = input;

  // Stub: In production, this will:
  // 1. Allocate browser session via browser-broker
  // 2. Create StateContext from input
  // 3. Execute state handler via ApplyStateMachine.executeState()
  // 4. Resolve next state via ApplyStateMachine.resolveNextState()
  // 5. Capture artifacts per state policy
  // 6. Return result with next state

  throw new Error(
    `browserActivity not yet implemented for state: ${state}. ` +
      `Data keys: [${Object.keys(data).join(", ")}]`,
  );
}
