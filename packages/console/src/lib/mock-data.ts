/**
 * Typed mock data for the operator console.
 *
 * All data is structured to match the same shapes the real API will return,
 * so swapping in live fetch calls is a one-line change per function in api.ts.
 *
 * Mock values are intentionally coherent: the 7d baseline tells a story of
 * a system steadily improving — rising success rate, falling HITL rate,
 * lower LLM cost, growing deterministic resolution.
 */

import type {
  KpiSnapshot,
  KpiPeriod,
  KpiValue,
  ReviewQueueStats,
  RunSummary,
  ReviewQueueItem,
} from "../types";
import { RunMode, RunOutcome, StateName } from "../types";

// ---------------------------------------------------------------------------
// KPI helpers
// ---------------------------------------------------------------------------

function kv(
  current: number,
  previous: number,
  format: (n: number) => string,
): KpiValue {
  const delta =
    previous === 0 ? 0 : Math.round(((current - previous) / previous) * 1000) / 10;
  return { current, previous, delta, formatted: format(current) };
}

const pct = (n: number) => `${n.toFixed(1)}%`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const dur = (n: number) => `${(n / 60).toFixed(1)} min`;
const int = (n: number) => `${n}`;

// ---------------------------------------------------------------------------
// KPI snapshots by period
// ---------------------------------------------------------------------------

export const MOCK_KPI_SNAPSHOTS: Record<KpiPeriod, KpiSnapshot> = {
  "24h": {
    period: "24h",
    generatedAt: new Date().toISOString(),
    successRate:       kv(88.5,  84.2, pct),
    hitlRate:          kv(10.1,  12.3, pct),
    llmCostUsd:        kv(0.82,  0.97, usd),
    deterministicRate: kv(93.2,  91.4, pct),
    totalRuns:         kv(21,    18,   int),
    submittedRuns:     kv(18,    15,   int),
    failedRuns:        kv(2,     3,    int),
    avgRunDurationSec: kv(174,   192,  dur),
    reviewPendingCount: 4,
  },
  "7d": {
    period: "7d",
    generatedAt: new Date().toISOString(),
    successRate:       kv(84.2,  79.1, pct),
    hitlRate:          kv(12.3,  18.7, pct),
    llmCostUsd:        kv(4.82,  5.91, usd),
    deterministicRate: kv(91.4,  88.2, pct),
    totalRuns:         kv(142,   124,  int),
    submittedRuns:     kv(119,   98,   int),
    failedRuns:        kv(14,    18,   int),
    avgRunDurationSec: kv(192,   218,  dur),
    reviewPendingCount: 4,
  },
  "30d": {
    period: "30d",
    generatedAt: new Date().toISOString(),
    successRate:       kv(81.7,  76.4, pct),
    hitlRate:          kv(15.8,  23.1, pct),
    llmCostUsd:        kv(18.94, 26.12, usd),
    deterministicRate: kv(89.1,  84.0, pct),
    totalRuns:         kv(614,   531,  int),
    submittedRuns:     kv(501,   406,  int),
    failedRuns:        kv(79,    102,  int),
    avgRunDurationSec: kv(210,   243,  dur),
    reviewPendingCount: 4,
  },
};

// ---------------------------------------------------------------------------
// Recent runs
// ---------------------------------------------------------------------------

export const MOCK_RECENT_RUNS: RunSummary[] = [
  {
    id: "run-001",
    jobId: "job-001",
    jobTitle: "Senior Software Engineer",
    company: "Acme Corp",
    candidateId: "cand-001",
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    outcome: null,
    currentState: StateName.PRE_SUBMIT_CHECK,
    percentComplete: 78,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 900_000).toISOString(),
    completedAt: null,
  },
  {
    id: "run-002",
    jobId: "job-002",
    jobTitle: "Product Designer",
    company: "Globex Inc",
    candidateId: "cand-001",
    mode: RunMode.FULL_AUTO,
    outcome: RunOutcome.SUBMITTED,
    currentState: StateName.CAPTURE_CONFIRMATION,
    percentComplete: 100,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    completedAt: new Date(Date.now() - 3_200_000).toISOString(),
  },
  {
    id: "run-003",
    jobId: "job-003",
    jobTitle: "Data Engineer",
    company: "Initech",
    candidateId: "cand-002",
    mode: RunMode.FULL_AUTO,
    outcome: RunOutcome.FAILED,
    currentState: StateName.FILL_REQUIRED_FIELDS,
    percentComplete: 50,
    humanInterventions: 1,
    startedAt: new Date(Date.now() - 7_200_000).toISOString(),
    completedAt: new Date(Date.now() - 7_100_000).toISOString(),
  },
  {
    id: "run-004",
    jobId: "job-004",
    jobTitle: "Backend Engineer",
    company: "Umbrella LLC",
    candidateId: "cand-003",
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    outcome: null,
    currentState: StateName.SUBMIT,
    percentComplete: 85,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 5_400_000).toISOString(),
    completedAt: null,
  },
  {
    id: "run-005",
    jobId: "job-005",
    jobTitle: "Staff Engineer",
    company: "Initech Systems",
    candidateId: "cand-001",
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    outcome: null,
    currentState: StateName.SUBMIT,
    percentComplete: 85,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 1_800_000).toISOString(),
    completedAt: null,
  },
  {
    id: "run-006",
    jobId: "job-006",
    jobTitle: "Platform Engineer",
    company: "Nakatomi Corp",
    candidateId: "cand-002",
    mode: RunMode.FULL_AUTO,
    outcome: RunOutcome.SUBMITTED,
    currentState: StateName.CAPTURE_CONFIRMATION,
    percentComplete: 100,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 10_800_000).toISOString(),
    completedAt: new Date(Date.now() - 10_200_000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export const MOCK_REVIEW_QUEUE: ReviewQueueItem[] = [
  {
    runId: "run-004",
    jobId: "job-004",
    candidateId: "cand-003",
    company: "Umbrella LLC",
    jobTitle: "Backend Engineer",
    jobUrl: "https://jobs.umbrella.com/456",
    currentState: StateName.SUBMIT,
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    waitingSince: new Date(Date.now() - 5_400_000).toISOString(),
  },
  {
    runId: "run-005",
    jobId: "job-005",
    candidateId: "cand-001",
    company: "Initech Systems",
    jobTitle: "Staff Engineer",
    jobUrl: "https://jobs.initech.com/789",
    currentState: StateName.SUBMIT,
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    waitingSince: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    runId: "run-007",
    jobId: "job-007",
    candidateId: "cand-002",
    company: "Nakatomi Corp",
    jobTitle: "Platform Engineer",
    jobUrl: "https://jobs.nakatomi.com/321",
    currentState: StateName.SUBMIT,
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    waitingSince: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    runId: "run-008",
    jobId: "job-008",
    candidateId: "cand-004",
    company: "Axiom Solutions",
    jobTitle: "DevOps Engineer",
    jobUrl: "https://jobs.axiom.io/devops",
    currentState: StateName.PRE_SUBMIT_CHECK,
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    waitingSince: new Date(Date.now() - 720_000).toISOString(),
  },
];

/** Derived from MOCK_REVIEW_QUEUE — kept in sync for use in stats panel. */
export function computeReviewQueueStats(
  items: ReviewQueueItem[],
): ReviewQueueStats {
  if (items.length === 0) {
    return { totalPending: 0, avgWaitSec: 0, oldestWaitSec: 0, newestWaitSec: 0 };
  }
  const waits = items.map(
    (i) => (Date.now() - new Date(i.waitingSince).getTime()) / 1000,
  );
  const total = waits.reduce((a, b) => a + b, 0);
  return {
    totalPending: items.length,
    avgWaitSec: total / items.length,
    oldestWaitSec: Math.max(...waits),
    newestWaitSec: Math.min(...waits),
  };
}
