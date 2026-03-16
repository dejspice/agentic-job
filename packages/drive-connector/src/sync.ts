import type { ApplyRun, JobOpportunity } from "@dejsol/core";
import type { SheetsClient } from "./sheets-client.js";
import {
  SHEET_COLUMNS,
  type BatchSheetUpdate,
  type TrackingSheetRow,
} from "./types.js";

export const DEFAULT_SHEET_NAME = "Applications";

/** Maximum number of range-updates per batchUpdate call to stay within quota. */
const BATCH_CHUNK_SIZE = 50;

export interface SyncJobsParams {
  spreadsheetId: string;
  /** Defaults to DEFAULT_SHEET_NAME ("Applications"). */
  sheetName?: string;
  jobs: JobOpportunity[];
  /**
   * The most recent ApplyRun for each job, keyed by job.id.
   * Jobs with no run yet can be omitted — they will still be synced with
   * status / score data from JobOpportunity.
   */
  runsByJobId: Map<string, ApplyRun>;
}

export interface SyncResult {
  /** Total rows written (updated + appended). */
  upserted: number;
  errors: Array<{ jobId: string; error: string }>;
}

/**
 * Converts a DB (JobOpportunity + optional ApplyRun) pair into the flat
 * string array written to the tracking sheet.
 *
 * Column order must match SHEET_COLUMNS exactly.
 */
export function translateToSheetRow(
  job: JobOpportunity,
  run: ApplyRun | null,
  rowIndex: number,
): TrackingSheetRow {
  return {
    rowIndex,
    jobId: job.id,
    candidateId: job.candidateId,
    company: job.company,
    jobTitle: job.jobTitle,
    jobUrl: job.jobUrl,
    location: job.location ?? "",
    status: job.status,
    outcome: run?.outcome ?? "",
    confirmationId: run?.confirmationId ?? "",
    fitScore: job.fitScore != null ? String(job.fitScore) : "",
    applyabilityScore:
      job.applyabilityScore != null ? String(job.applyabilityScore) : "",
    runMode: run?.mode ?? "",
    currentState: run?.currentState ?? "",
    startedAt: run?.startedAt ? run.startedAt.toISOString() : "",
    completedAt: run?.completedAt ? run.completedAt.toISOString() : "",
    lastSyncedAt: new Date().toISOString(),
  };
}

function rowToValues(row: TrackingSheetRow): string[] {
  return SHEET_COLUMNS.map((col) => {
    switch (col) {
      case "job_id":
        return row.jobId;
      case "candidate_id":
        return row.candidateId;
      case "company":
        return row.company;
      case "job_title":
        return row.jobTitle;
      case "job_url":
        return row.jobUrl;
      case "location":
        return row.location;
      case "status":
        return row.status;
      case "outcome":
        return row.outcome;
      case "confirmation_id":
        return row.confirmationId;
      case "fit_score":
        return row.fitScore;
      case "applyability_score":
        return row.applyabilityScore;
      case "run_mode":
        return row.runMode;
      case "current_state":
        return row.currentState;
      case "started_at":
        return row.startedAt;
      case "completed_at":
        return row.completedAt;
      case "last_synced_at":
        return row.lastSyncedAt;
    }
  });
}

function colLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

const LAST_COL = colLetter(SHEET_COLUMNS.length - 1);

/** Splits an array into chunks of at most chunkSize. */
function chunk<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Syncs a list of JobOpportunity records (plus their latest ApplyRun) into the
 * candidate's Google Sheet tracking tab.
 *
 * Strategy:
 *  1. Ensure the header row exists.
 *  2. Read the full job-ID→row-number index from column A in one API call.
 *  3. Batch-update all existing rows (chunked to respect batchUpdate limits).
 *  4. Append new rows sequentially.
 *
 * This is a DB → Sheet one-way sync only. Sheet edits are never read back.
 */
export async function syncJobsToSheet(
  client: SheetsClient,
  params: SyncJobsParams,
): Promise<SyncResult> {
  const sheetName = params.sheetName ?? DEFAULT_SHEET_NAME;
  const result: SyncResult = { upserted: 0, errors: [] };

  await client.ensureHeader(params.spreadsheetId, sheetName);

  const jobIdToRow = await client.buildJobIdRowMap(
    params.spreadsheetId,
    sheetName,
  );

  const updates: BatchSheetUpdate[] = [];
  const appends: Array<{ jobId: string; values: string[] }> = [];

  for (const job of params.jobs) {
    const run = params.runsByJobId.get(job.id) ?? null;
    const existingRow = jobIdToRow.get(job.id);

    if (existingRow != null) {
      const sheetRow = translateToSheetRow(job, run, existingRow);
      updates.push({
        range: `${sheetName}!A${existingRow}:${LAST_COL}${existingRow}`,
        values: [rowToValues(sheetRow)],
      });
    } else {
      const sheetRow = translateToSheetRow(job, run, -1);
      appends.push({ jobId: job.id, values: rowToValues(sheetRow) });
    }
  }

  // Batch-update existing rows in chunks to avoid exceeding API limits.
  for (const ch of chunk(updates, BATCH_CHUNK_SIZE)) {
    try {
      await client.batchUpdateRows(params.spreadsheetId, ch);
      result.upserted += ch.length;
    } catch (err) {
      for (const u of ch) {
        // Extract job ID from the first cell value.
        const jobId = u.values[0]?.[0] ?? "(unknown)";
        result.errors.push({ jobId, error: String(err) });
      }
    }
  }

  // Append new rows one at a time to preserve insertion order.
  for (const { jobId, values } of appends) {
    try {
      await client.appendRow(params.spreadsheetId, sheetName, values);
      result.upserted++;
    } catch (err) {
      result.errors.push({ jobId, error: String(err) });
    }
  }

  return result;
}
