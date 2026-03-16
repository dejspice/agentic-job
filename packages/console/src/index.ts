/**
 * Public surface of the console package.
 *
 * This package is a standalone SPA (bootstrapped via main.tsx + index.html).
 * The exports below expose the typed UI models so that shared tooling or
 * test helpers in the monorepo can import console types without referencing
 * internal source paths.
 */

export type {
  DashboardMetric,
  KpiValue,
  KpiSnapshot,
  KpiPeriod,
  ReviewQueueStats,
  RunSummary,
  RunDetailView,
  ReviewQueueItem,
  ReviewDecision,
  PolicyEntry,
  StateHistoryEntry,
  ArtifactUrls,
  RunCost,
  RunErrorEntry,
  RunStatus,
  // Domain constant types
  RunMode,
  RunOutcome,
  StateName,
  AtsType,
  JobStatus,
} from "./types";
