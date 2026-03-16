/**
 * Console API client.
 *
 * Each function mirrors the corresponding backend route (or planned route).
 * Currently all functions return mock data so the console works without a
 * running backend.  To wire in live data, replace the mock import with a
 * fetch call to the real endpoint — the function signatures stay the same.
 *
 * Backend route alignment (packages/api):
 *   getKpiSnapshot    → GET /api/runs/kpi?period=7d   (planned)
 *   getRecentRuns     → GET /api/runs?pageSize=N
 *   getReviewQueue    → GET /api/runs/review
 *   getReviewQueueStats → derived from GET /api/runs/review
 */

import type { KpiPeriod, KpiSnapshot, RunSummary, ReviewQueueItem, ReviewQueueStats } from "../types";
import {
  MOCK_KPI_SNAPSHOTS,
  MOCK_RECENT_RUNS,
  MOCK_REVIEW_QUEUE,
  computeReviewQueueStats,
} from "./mock-data";

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

/**
 * Fetch the KPI snapshot for a given observation period.
 *
 * Future: GET /api/runs/kpi?period=${period}
 */
export async function getKpiSnapshot(period: KpiPeriod): Promise<KpiSnapshot> {
  // TODO: const res = await fetch(`/api/runs/kpi?period=${period}`);
  //       return (await res.json()).data;
  return Promise.resolve(MOCK_KPI_SNAPSHOTS[period]);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * Fetch the most recent runs, newest first.
 *
 * Future: GET /api/runs?pageSize=${limit}&sort=startedAt:desc
 */
export async function getRecentRuns(limit = 10): Promise<RunSummary[]> {
  // TODO: const res = await fetch(`/api/runs?pageSize=${limit}`);
  //       return (await res.json()).data;
  return Promise.resolve(MOCK_RECENT_RUNS.slice(0, limit));
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

/**
 * Fetch all runs currently waiting in the review gate.
 *
 * Future: GET /api/runs/review
 */
export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  // TODO: const res = await fetch(`/api/runs/review`);
  //       return (await res.json()).data;
  return Promise.resolve(MOCK_REVIEW_QUEUE);
}

/**
 * Compute summary statistics for the review queue.
 * Derived from the queue list — no dedicated backend endpoint needed.
 */
export async function getReviewQueueStats(): Promise<ReviewQueueStats> {
  const items = await getReviewQueue();
  return computeReviewQueueStats(items);
}
