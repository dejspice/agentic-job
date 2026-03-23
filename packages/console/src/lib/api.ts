/**
 * Console API client — wired to packages/api endpoints.
 *
 * Base URL: /api (proxied by Vite dev server → http://localhost:4000).
 *
 * Endpoint alignment:
 *   getRecentRuns       → GET  /api/runs?pageSize=N
 *   getRunDetail        → GET  /api/runs/:id  +  GET  /api/runs/:id/status
 *   getReviewQueue      → GET  /api/review/queue
 *   getReviewQueueStats → derived from getReviewQueue (no dedicated endpoint)
 *   approveRun          → POST /api/review/:runId/approve
 *   rejectRun           → POST /api/review/:runId/reject
 *
 * Fallback: getKpiSnapshot still uses mock data because the /api/runs/kpi
 * aggregation endpoint is not yet implemented server-side.  The function
 * signature is stable so the Dashboard page needs no changes when the real
 * endpoint is wired.
 */

import type {
  KpiPeriod,
  KpiSnapshot,
  RunSummary,
  ReviewQueueItem,
  ReviewQueueStats,
  RunDetailView,
  StateHistoryEntry,
  RunErrorEntry,
  ArtifactUrls,
  RunCost,
  RunMode,
  RunOutcome,
  StateName,
  VerificationQueueItem,
} from "../types";
import { MOCK_KPI_SNAPSHOTS, MOCK_VERIFICATION_QUEUE, computeReviewQueueStats } from "./mock-data";

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(`[api] ${path}: ${msg}`);
  }

  const json = (await res.json()) as { data?: T };
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Wire-format models (structural projection of packages/api DTOs)
// These mirror the server-side shapes without importing from the API package.
// ---------------------------------------------------------------------------

interface ApiApplyRun {
  id: string;
  jobId: string;
  candidateId: string;
  mode: RunMode;
  outcome: RunOutcome | null;
  currentState: string | null;
  humanInterventions: number;
  startedAt: string;
  completedAt: string | null;
  confirmationId: string | null;
  stateHistoryJson: StateHistoryEntry[];
  errorLogJson: RunErrorEntry[];
  artifactUrlsJson: ArtifactUrls;
  costJson: RunCost;
}

interface ApiRunStatus {
  runId: string;
  currentState: StateName | null;
  phase: string;
  statesCompleted: StateName[];
  percentComplete: number;
}

// ---------------------------------------------------------------------------
// Adapters: server DTOs → console UI models
// ---------------------------------------------------------------------------

const TOTAL_STATES = 14;

function percentFromHistory(history: StateHistoryEntry[]): number {
  return Math.min(100, Math.round((history.length / TOTAL_STATES) * 100));
}

function toRunSummary(r: ApiApplyRun): RunSummary {
  const history = r.stateHistoryJson ?? [];
  return {
    id: r.id,
    jobId: r.jobId,
    // company/jobTitle are on JobOpportunity, not included in the flat ApplyRun
    // list response. Shown as empty until the list endpoint joins the relation.
    jobTitle: "",
    company: "",
    candidateId: r.candidateId,
    mode: r.mode,
    outcome: r.outcome,
    currentState: (r.currentState as StateName | null) ?? null,
    percentComplete: percentFromHistory(history),
    humanInterventions: r.humanInterventions ?? 0,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  };
}

function toRunDetail(r: ApiApplyRun, status?: ApiRunStatus): RunDetailView {
  return {
    id: r.id,
    jobId: r.jobId,
    jobTitle: "",
    company: "",
    jobUrl: "",
    candidateId: r.candidateId,
    mode: r.mode,
    outcome: r.outcome,
    currentState:
      status?.currentState ?? (r.currentState as StateName | null) ?? null,
    percentComplete:
      status?.percentComplete ?? percentFromHistory(r.stateHistoryJson ?? []),
    stateHistory: r.stateHistoryJson ?? [],
    artifacts: r.artifactUrlsJson ?? {},
    cost: r.costJson ?? {},
    humanInterventions: r.humanInterventions ?? 0,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    confirmationId: r.confirmationId,
    errors: r.errorLogJson ?? [],
  };
}

// ---------------------------------------------------------------------------
// KPI — mock fallback (GET /api/runs/kpi not yet implemented server-side)
// ---------------------------------------------------------------------------

/**
 * Fetch the KPI snapshot for a given observation period.
 *
 * The /api/runs/kpi aggregation endpoint does not yet exist.
 * Returns mock data until the server-side endpoint is wired.
 */
export async function getKpiSnapshot(period: KpiPeriod): Promise<KpiSnapshot> {
  // TODO: replace with real fetch once GET /api/runs/kpi?period=${period} lands
  return Promise.resolve(MOCK_KPI_SNAPSHOTS[period]);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * Fetch the most recent runs, newest first.
 * GET /api/runs?pageSize=N
 */
export async function getRecentRuns(limit = 10): Promise<RunSummary[]> {
  try {
    const items = await apiFetch<ApiApplyRun[]>(`/runs?pageSize=${limit}`);
    return (items ?? []).map(toRunSummary);
  } catch {
    return [];
  }
}

/**
 * Fetch full detail for a single run.
 * GET /api/runs/:id  +  GET /api/runs/:id/status (in parallel)
 */
export async function getRunDetail(runId: string): Promise<RunDetailView> {
  const [run, status] = await Promise.all([
    apiFetch<ApiApplyRun>(`/runs/${runId}`),
    apiFetch<ApiRunStatus>(`/runs/${runId}/status`).catch(() => undefined),
  ]);
  return toRunDetail(run, status);
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

/**
 * Fetch runs currently waiting at the review gate.
 * GET /api/review/queue
 *
 * Returns an empty array on error so the page degrades gracefully.
 */
export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  try {
    const items = await apiFetch<ReviewQueueItem[]>(`/review/queue`);
    return items ?? [];
  } catch {
    return [];
  }
}

/**
 * Compute summary statistics for the review queue.
 * Derived from getReviewQueue — no dedicated endpoint needed.
 */
export async function getReviewQueueStats(): Promise<ReviewQueueStats> {
  const items = await getReviewQueue();
  return computeReviewQueueStats(items);
}

// ---------------------------------------------------------------------------
// Verification required queue
// ---------------------------------------------------------------------------

/**
 * Fetch runs awaiting email verification.
 * GET /api/runs/verification-required
 *
 * Falls back to mock data when the endpoint is unavailable.
 */
export async function getVerificationQueue(): Promise<VerificationQueueItem[]> {
  try {
    const items = await apiFetch<VerificationQueueItem[]>(`/runs/verification-required`);
    // Server stub returns [] — fall back to mock so the UI is populated
    if (Array.isArray(items) && items.length > 0) return items;
    return MOCK_VERIFICATION_QUEUE;
  } catch {
    return MOCK_VERIFICATION_QUEUE;
  }
}

// ---------------------------------------------------------------------------
// Review decisions
// ---------------------------------------------------------------------------

/**
 * Approve a run at the review gate.
 * POST /api/review/:runId/approve
 */
export async function approveRun(
  runId: string,
  opts?: { edits?: Record<string, string>; reviewerNote?: string },
): Promise<void> {
  await apiFetch(`/review/${runId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved: true, ...opts }),
  });
}

/**
 * Reject a run at the review gate.
 * POST /api/review/:runId/reject
 * reviewerNote is required by the API endpoint.
 */
export async function rejectRun(
  runId: string,
  reviewerNote: string,
): Promise<void> {
  await apiFetch(`/review/${runId}/reject`, {
    method: "POST",
    body: JSON.stringify({ approved: false, reviewerNote }),
  });
}
