export type AssetKind = "resume" | "cover_letter" | "other";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  createdTime: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
  parents: string[];
}

export interface CandidateAsset extends DriveFile {
  kind: AssetKind;
}

/**
 * Column order in the tracking sheet. Order is significant — changes here
 * will break existing sheets unless a migration is applied.
 */
export const SHEET_COLUMNS = [
  "job_id",
  "candidate_id",
  "company",
  "job_title",
  "job_url",
  "location",
  "status",
  "outcome",
  "confirmation_id",
  "fit_score",
  "applyability_score",
  "run_mode",
  "current_state",
  "started_at",
  "completed_at",
  "last_synced_at",
] as const;

export type SheetColumnName = (typeof SHEET_COLUMNS)[number];

/** One row of the candidate tracking spreadsheet as structured data. */
export interface TrackingSheetRow {
  /** 1-based row index in the sheet; -1 when not yet written. */
  rowIndex: number;
  jobId: string;
  candidateId: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  location: string;
  status: string;
  outcome: string;
  confirmationId: string;
  fitScore: string;
  applyabilityScore: string;
  runMode: string;
  currentState: string;
  startedAt: string;
  completedAt: string;
  lastSyncedAt: string;
}

/** A single range update for the Sheets batchUpdate API. */
export interface BatchSheetUpdate {
  /** A1-notation range, e.g. "Applications!A2:P2". */
  range: string;
  values: string[][];
}

/**
 * Shared authentication configuration accepted by both DriveClient and
 * SheetsClient. Supports service-account key file, inline credentials, or
 * Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS env var).
 */
export interface GoogleAuthConfig {
  /** Absolute path to a service-account JSON key file. */
  keyFile?: string;
  /** Inline service-account key JSON (alternative to keyFile). */
  credentials?: object;
  /** OAuth2 scopes to request. Each client provides sensible defaults. */
  scopes?: string[];
}
