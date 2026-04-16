/**
 * Library export — re-exports constants used by the worker
 * so other packages can reference the same task queue name.
 */
export const TASK_QUEUE = "apply-workflow" as const;
