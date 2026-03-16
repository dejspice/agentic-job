/**
 * Typed mappers: workflow query results → API DTO shapes.
 *
 * The Temporal client's queryWorkflowStatus() and queryProgress() return
 * `unknown` because the API layer does not take a hard dependency on
 * @dejsol/workflows.  These mappers normalise those `unknown` values into
 * the typed API shapes declared in types.ts, surfacing any structural gaps
 * between the workflow and API contracts.
 *
 * Design principle: mappers accept `unknown` inputs and project them
 * structurally.  The snapshot interfaces below are the API layer's view of
 * the workflow's query contracts — they must stay in sync with:
 *   packages/workflows/src/queries.ts  (WorkflowStatus, WorkflowProgress)
 */

import type { StateName } from "@dejsol/core";
import type { RunStatusResponse, ReviewDetailResponse } from "./types.js";

// ---------------------------------------------------------------------------
// Internal snapshot types
// Mirrored from @dejsol/workflows query shapes — owned here to avoid a
// cross-package import that would couple the API to the workflow build.
// ---------------------------------------------------------------------------

interface WorkflowStatusSnapshot {
  currentState: string | null;
  phase: string;
  statesCompleted: string[];
  errors: Array<{ state: string; message: string; timestamp: string }>;
}

interface WorkflowProgressSnapshot {
  totalStates: number;
  completedStates: number;
  currentState: string | null;
  phase: string;
  percentComplete: number;
}

const TOTAL_STATES = 14;

// ---------------------------------------------------------------------------
// RunStatusResponse mapper
// ---------------------------------------------------------------------------

/**
 * Map a Temporal workflowStatusQuery result (and optional progressQuery
 * result) to the RunStatusResponse shape used by GET /api/runs/:id/status.
 *
 * @param runId        - The run ID from the route parameter.
 * @param rawStatus    - Raw result of queryWorkflowStatus(); may be unknown.
 * @param rawProgress  - Optional raw result of queryProgress(); used for
 *                       a precise percentComplete value when available.
 */
export function workflowStatusToRunStatus(
  runId: string,
  rawStatus: unknown,
  rawProgress?: unknown,
): RunStatusResponse {
  const s = (rawStatus ?? {}) as WorkflowStatusSnapshot;
  const p = rawProgress as WorkflowProgressSnapshot | undefined;

  const statesCompleted = (s.statesCompleted ?? []) as StateName[];

  const percentComplete =
    typeof p?.percentComplete === "number"
      ? p.percentComplete
      : Math.round((statesCompleted.length / TOTAL_STATES) * 100);

  return {
    runId,
    currentState: (s.currentState as StateName | null) ?? null,
    phase: typeof s.phase === "string" ? s.phase : "initializing",
    statesCompleted,
    percentComplete,
  };
}

// ---------------------------------------------------------------------------
// ReviewDetailResponse partial mapper
// ---------------------------------------------------------------------------

/**
 * Build the workflow-derivable portion of a ReviewDetailResponse from
 * a workflowStatusQuery result.
 *
 * Fields that require database lookup (company, jobTitle, formData,
 * screenshotUrls) are omitted here and expected to be merged by the
 * route handler once the ApplyRun record is loaded.
 */
export function workflowStatusToReviewPartial(
  runId: string,
  rawStatus: unknown,
): Pick<
  ReviewDetailResponse,
  "runId" | "currentState" | "statesCompleted" | "screenshotUrls"
> {
  const s = (rawStatus ?? {}) as WorkflowStatusSnapshot;

  return {
    runId,
    currentState: (s.currentState as StateName | null) ?? null,
    statesCompleted: (s.statesCompleted ?? []) as StateName[],
    // Artifact screenshot URLs are served from ApplyRun.artifactUrlsJson in
    // the DB, not from the live workflow query.  The route handler will merge
    // them once the run record is loaded.
    screenshotUrls: [],
  };
}

// ---------------------------------------------------------------------------
// Workflow error normaliser
// ---------------------------------------------------------------------------

/**
 * Extract structured errors from a workflowStatusQuery result.
 * Returns an empty array when there are no errors or the status is unknown.
 */
export function extractWorkflowErrors(
  rawStatus: unknown,
): Array<{ state: string; message: string; timestamp: string }> {
  const s = (rawStatus ?? {}) as WorkflowStatusSnapshot;
  return Array.isArray(s.errors) ? s.errors : [];
}
