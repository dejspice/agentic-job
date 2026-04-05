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
import type { ArtifactUrls, RunOutcome, RunCost } from "@dejsol/core";
import type { VerificationQueueItem, KpiPeriod, KpiSnapshot, KpiValue } from "./types.js";

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

// ---------------------------------------------------------------------------
// KPI aggregation
// ---------------------------------------------------------------------------

/** Period lengths in milliseconds. */
const PERIOD_MS: Record<KpiPeriod, number> = {
  "24h": 86_400_000,
  "7d":  604_800_000,
  "30d": 2_592_000_000,
};

/**
 * Shape of a run row fetched for KPI aggregation.
 * Uses a minimal select to avoid pulling large JSON columns.
 */
export interface KpiRunRow {
  outcome: string | null;
  humanInterventions: number;
  startedAt: Date;
  completedAt: Date | null;
  costJson: unknown;
}

/**
 * Pure aggregation function — computes a KpiSnapshot from two pre-fetched
 * arrays of run rows (current period and previous period) and a review count.
 *
 * Keeping this separate from the Prisma query makes it trivially unit-testable.
 */
export function buildKpiSnapshot(
  period: KpiPeriod,
  current: KpiRunRow[],
  previous: KpiRunRow[],
  reviewPendingCount: number,
): KpiSnapshot {
  function aggregate(runs: KpiRunRow[]) {
    const total = runs.length;
    const submitted = runs.filter((r) => r.outcome === "SUBMITTED").length;
    const failed = runs.filter((r) => r.outcome === "FAILED").length;
    const verificationRequired = runs.filter(
      (r) => r.outcome === "VERIFICATION_REQUIRED",
    ).length;
    const hitl = runs.filter((r) => (r.humanInterventions ?? 0) > 0).length;

    const completedRuns = runs.filter((r) => r.completedAt !== null);
    const avgDurationSec =
      completedRuns.length > 0
        ? completedRuns.reduce(
            (sum, r) =>
              sum + (r.completedAt!.getTime() - r.startedAt.getTime()) / 1000,
            0,
          ) / completedRuns.length
        : 0;

    const llmCost = runs.reduce((sum, r) => {
      const cost = (r.costJson ?? {}) as RunCost;
      return sum + (cost.estimatedCostUsd ?? 0);
    }, 0);

    // deterministicRate: runs with no LLM calls / total.
    // Approximation until per-field answer-bank tracking is wired.
    const deterministicRuns = runs.filter((r) => {
      const cost = (r.costJson ?? {}) as RunCost;
      return !cost.llmCalls || cost.llmCalls === 0;
    }).length;

    const successRate =
      total > 0 ? ((submitted + verificationRequired) / total) * 100 : 0;
    const hitlRate = total > 0 ? (hitl / total) * 100 : 0;
    const deterministicRate =
      total > 0 ? (deterministicRuns / total) * 100 : 0;

    return {
      total,
      submitted,
      failed,
      verificationRequired,
      hitlRate,
      avgDurationSec,
      llmCost,
      successRate,
      deterministicRate,
    };
  }

  const c = aggregate(current);
  const p = aggregate(previous);

  function kv(
    currentVal: number,
    prevVal: number,
    format: (n: number) => string,
  ): KpiValue {
    const delta =
      prevVal === 0
        ? undefined
        : Math.round(((currentVal - prevVal) / prevVal) * 1000) / 10;
    return { current: currentVal, previous: prevVal, delta, formatted: format(currentVal) };
  }

  const pct = (n: number) => `${n.toFixed(1)}%`;
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const dur = (n: number) =>
    n < 60 ? `${Math.round(n)}s` : `${(n / 60).toFixed(1)} min`;
  const int = (n: number) => `${Math.round(n)}`;

  return {
    period,
    generatedAt: new Date().toISOString(),
    successRate:              kv(c.successRate,         p.successRate,         pct),
    hitlRate:                 kv(c.hitlRate,             p.hitlRate,            pct),
    llmCostUsd:               kv(c.llmCost,             p.llmCost,             usd),
    deterministicRate:        kv(c.deterministicRate,   p.deterministicRate,   pct),
    totalRuns:                kv(c.total,               p.total,               int),
    submittedRuns:            kv(c.submitted,           p.submitted,           int),
    failedRuns:               kv(c.failed,              p.failed,              int),
    verificationRequiredRuns: kv(c.verificationRequired, p.verificationRequired, int),
    avgRunDurationSec:        kv(c.avgDurationSec,      p.avgDurationSec,      dur),
    reviewPendingCount,
  };
}

/**
 * Compute a KPI snapshot for the given period by querying apply_runs.
 *
 * Fetches current and previous period rows in parallel using a minimal
 * column selection, then delegates all aggregation to buildKpiSnapshot.
 *
 * @param prisma   Active PrismaClient instance.
 * @param period   Observation window: "24h" | "7d" | "30d".
 */
export async function computeKpiSnapshot(
  prisma: PrismaClient,
  period: KpiPeriod,
): Promise<KpiSnapshot> {
  const now = Date.now();
  const periodMs = PERIOD_MS[period];
  const currentStart  = new Date(now - periodMs);
  const previousStart = new Date(now - 2 * periodMs);

  const rowSelect = {
    outcome:            true,
    humanInterventions: true,
    startedAt:          true,
    completedAt:        true,
    costJson:           true,
  } as const;

  const [currentRuns, previousRuns, reviewPendingCount] = await Promise.all([
    prisma.applyRun.findMany({
      where: { startedAt: { gte: currentStart } },
      select: rowSelect,
    }),
    prisma.applyRun.findMany({
      where: { startedAt: { gte: previousStart, lt: currentStart } },
      select: rowSelect,
    }),
    prisma.applyRun.count({
      where: { outcome: null, mode: "REVIEW_BEFORE_SUBMIT" },
    }),
  ]);

  return buildKpiSnapshot(period, currentRuns, previousRuns, reviewPendingCount);
}
