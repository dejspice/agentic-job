import type { StateName } from "@dejsol/core";

/** Outcome of executing a single state. */
export type StateOutcome = "success" | "failure" | "skipped" | "escalated";

/**
 * Runtime context passed to every state handler.
 * Will be extended with browser session, policy engine, etc. in later phases.
 */
export interface StateContext {
  runId: string;
  jobId: string;
  candidateId: string;
  jobUrl: string;
  currentState: StateName;
  stateHistory: ReadonlyArray<{ state: StateName; outcome: StateOutcome }>;
  /** Shared mutable data bag carried across states within a single run. */
  data: Record<string, unknown>;
}

/** Result returned by a state handler's execute function. */
export interface StateResult {
  outcome: StateOutcome;
  /** Arbitrary data produced by this state, merged into context.data by the orchestrator. */
  data?: Record<string, unknown>;
  error?: string;
  /** Explicit override for the next state. When omitted the orchestrator uses canonical order. */
  nextState?: StateName;
}

/** Uniform interface every state module must implement. */
export interface StateHandler {
  /** Canonical state name — must match the StateName enum value. */
  name: StateName;
  /** Human-readable description of when this state may be entered. */
  entryCriteria: string;
  /** Human-readable description of what constitutes a successful execution. */
  successCriteria: string;
  /** Execute the state logic. Real browser/LLM actions will be wired in later phases. */
  execute(context: StateContext): Promise<StateResult>;
}
