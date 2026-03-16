import { defineQuery } from "@temporalio/workflow";
import type { StateName } from "@dejsol/core";

/**
 * Workflow execution status phases.
 */
export type WorkflowPhase =
  | "initializing"
  | "running"
  | "waiting_review"
  | "submitting"
  | "capturing"
  | "completed"
  | "failed"
  | "cancelled"
  | "escalated";

/**
 * Full status snapshot of the workflow, returned by the status query.
 */
export interface WorkflowStatus {
  currentState: StateName | null;
  phase: WorkflowPhase;
  statesCompleted: StateName[];
  errors: WorkflowErrorEntry[];
}

/**
 * Progress snapshot for UI consumption.
 */
export interface WorkflowProgress {
  totalStates: number;
  completedStates: number;
  currentState: StateName | null;
  phase: WorkflowPhase;
  percentComplete: number;
}

/**
 * Structured error entry tracked during workflow execution.
 */
export interface WorkflowErrorEntry {
  state: StateName;
  message: string;
  timestamp: string;
}

/** Query: returns the current state name the workflow is executing (or null if not started / finished). */
export const currentStateQuery = defineQuery<StateName | null>("currentState");

/** Query: returns the full workflow status snapshot. */
export const workflowStatusQuery = defineQuery<WorkflowStatus>(
  "workflowStatus",
);

/** Query: returns the progress snapshot for progress bars / dashboards. */
export const progressQuery = defineQuery<WorkflowProgress>("progress");
