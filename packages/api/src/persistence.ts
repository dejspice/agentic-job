/**
 * Workflow result persistence layer.
 *
 * Provides a single, well-defined function to persist a completed apply
 * workflow result into the `apply_runs` table.
 *
 * Ownership: packages/api — the API layer is responsible for all database
 * writes.  Pure workflow and state-machine logic must not import this module.
 *
 * Caller responsibilities
 * -----------------------
 * 1. The apply_runs row must already exist (created when the run was started).
 * 2. Convert the workflow's RunArtifactBundle to ArtifactUrls by calling
 *    bundleToArtifactUrls() before constructing RunResultPayload.
 *    (bundleToArtifactUrls lives in packages/workflows/src/artifacts.ts)
 * 3. Pass an active PrismaClient instance.
 *
 * Idempotency
 * -----------
 * persistRunResult is an idempotent update: calling it multiple times with
 * the same runId and payload produces the same final row state.  This matches
 * the at-least-once delivery guarantee of Temporal activities.
 */

import type { PrismaClient, RunOutcome as PrismaRunOutcome } from "@prisma/client";
import type { ArtifactUrls, RunOutcome } from "@dejsol/core";
import type { VerificationQueueItem } from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * All data required to persist a completed workflow result.
 *
 * Construct this from ApplyWorkflowResult (packages/workflows) after the
 * workflow has completed:
 *
 *   const payload: RunResultPayload = {
 *     ...result,
 *     artifactUrls: bundleToArtifactUrls(result.artifacts),
 *   };
 *   await persistRunResult(runId, payload, prisma);
 */
export interface RunResultPayload {
  /** Final outcome returned by the workflow. */
  outcome: RunOutcome;

  /** The last state the workflow reached (null if workflow never started). */
  finalState: string | null;

  /** All states executed to completion, in chronological order. */
  statesCompleted: string[];

  /**
   * Application confirmation ID.  Present only when outcome === SUBMITTED.
   * Maps to apply_runs.confirmation_id.
   */
  confirmationId?: string;

  /**
   * Structured error entries from the workflow.
   * Sourced from ApplyWorkflowResult.errors (WorkflowErrorEntry[]).
   * Maps to apply_runs.error_log_json.
   */
  errors: Array<{ state: string; message: string; timestamp: string }>;

  /**
   * Artifact URLs already converted from RunArtifactBundle via
   * bundleToArtifactUrls().  Maps to apply_runs.artifact_urls_json.
   */
  artifactUrls: ArtifactUrls;

  /**
   * Optional LLM cost data accumulated during the run.
   * Maps to apply_runs.cost_json.  Defaults to {} when not provided.
   */
  costJson?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Persistence function
// ---------------------------------------------------------------------------

/**
 * Persist a completed apply workflow result to the apply_runs table.
 *
 * Updates these columns on the existing row identified by runId:
 *   - outcome            ← payload.outcome
 *   - current_state      ← payload.finalState
 *   - state_history_json ← built from payload.statesCompleted + payload.errors
 *   - artifact_urls_json ← payload.artifactUrls (pre-converted by caller)
 *   - error_log_json     ← payload.errors mapped to ErrorLogEntry shape
 *   - cost_json          ← payload.costJson (default: {})
 *   - confirmation_id    ← payload.confirmationId (null when absent)
 *   - completed_at       ← current timestamp
 *
 * @throws {PrismaClientKnownRequestError} P2025 if the run row does not exist.
 */
export async function persistRunResult(
  runId: string,
  payload: RunResultPayload,
  prisma: PrismaClient,
): Promise<void> {
  const {
    outcome,
    finalState,
    statesCompleted,
    confirmationId,
    errors,
    artifactUrls,
    costJson = {},
  } = payload;

  // --- Build state_history_json ---
  // Each entry matches core's StateHistoryEntry shape.
  // States in the errors array are marked as "failure"; all others as "success".
  const errorByState = new Map(errors.map((e) => [e.state, e]));

  const stateHistoryJson = statesCompleted.map((state) => {
    const err = errorByState.get(state);
    return {
      state,
      enteredAt: err?.timestamp ?? new Date().toISOString(),
      outcome: err !== undefined ? ("failure" as const) : ("success" as const),
      ...(err !== undefined ? { error: err.message } : {}),
    };
  });

  // --- Build error_log_json ---
  // Matches core's ErrorLogEntry shape.  Workflow-level errors are marked
  // non-recoverable (the workflow already completed before we persist).
  const errorLogJson = errors.map((e) => ({
    timestamp: e.timestamp,
    state: e.state,
    message: e.message,
    recoverable: false,
  }));

  // --- Persist ---
  await prisma.applyRun.update({
    where: { id: runId },
    data: {
      // Prisma RunOutcome enum has identical string values to @dejsol/core RunOutcome.
      outcome: outcome as PrismaRunOutcome,
      currentState: finalState,
      // JSON columns: cast via unknown to satisfy Prisma's InputJsonValue type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateHistoryJson: stateHistoryJson as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifactUrlsJson: artifactUrls as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      errorLogJson: errorLogJson as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      costJson: costJson as any,
      confirmationId: confirmationId ?? null,
      completedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Verification queue query
// ---------------------------------------------------------------------------

/**
 * Query apply_runs for all runs with outcome = VERIFICATION_REQUIRED.
 *
 * Joins job_opportunities so the result carries the company, jobTitle, and
 * jobUrl needed to surface the operator handoff queue in the console.
 *
 * The post-submit screenshot URL is extracted from artifactUrlsJson on a
 * best-effort basis — keys containing "post-submit" are checked first.
 *
 * @param prisma  Active PrismaClient instance.
 * @param limit   Maximum rows to return (default 50, newest-first).
 */
export async function queryVerificationRuns(
  prisma: PrismaClient,
  limit = 50,
): Promise<VerificationQueueItem[]> {
  const runs = await prisma.applyRun.findMany({
    where: { outcome: "VERIFICATION_REQUIRED" as PrismaRunOutcome },
    include: { job: true },
    orderBy: { completedAt: "desc" },
    take: limit,
  });

  return runs.map((run) => {
    // artifactUrlsJson is Prisma.JsonValue; cast to the known ArtifactUrls shape.
    const artifacts = (run.artifactUrlsJson ?? {}) as ArtifactUrls;
    const screenshotMap = artifacts.screenshots ?? {};

    // Find the post-submit screenshot — harness stores it under a key that
    // contains "post-submit".
    const postSubmitEntry = Object.entries(screenshotMap).find(([key]) =>
      key.toLowerCase().includes("post-submit"),
    );

    return {
      runId: run.id,
      jobId: run.jobId,
      candidateId: run.candidateId,
      company: run.job.company,
      jobTitle: run.job.jobTitle,
      jobUrl: run.job.jobUrl,
      completedAt:
        run.completedAt?.toISOString() ?? run.startedAt.toISOString(),
      ...(postSubmitEntry ? { postSubmitScreenshotUrl: postSubmitEntry[1] } : {}),
    };
  });
}
