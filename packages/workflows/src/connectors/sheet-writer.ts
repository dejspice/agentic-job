/**
 * Google Sheets Writer — writes status/results back to a Google Sheet.
 *
 * Updates specific cells in a row to reflect the outcome of an application run.
 * Aligned with the real sheet layout ("Job Tracking" tab):
 *   A: # (resume id) | B: Job Title | C: Company | D: Location
 *   E: Status        | F: Application Date | G: Application URL
 *   H: Resume Link   | I: Notes
 *   J: run_id        | K: outcome   | L: error   | M: completed_at
 *
 * Writeback updates:
 *   E (Status) — e.g. "Applied", "Failed", "Skipped"
 *   F (Application Date) — ISO timestamp
 *   J:M — run metadata
 */

import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { resolveGoogleCredentials } from "./google-auth.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export type WritebackStatus =
  | "Applied"
  | "Verification Required"
  | "Failed"
  | "Skipped"
  | "Not Applied";

export interface WritebackResult {
  rowIndex: number;
  status: WritebackStatus;
  runId: string;
  outcome: string;
  error?: string;
  completedAt?: string;
}

export interface SheetWriterOptions {
  spreadsheetId: string;
  sheetName?: string;
}

/**
 * Write a single row's result back to the Google Sheet.
 * Updates E (Status), F (Application Date), J:M (run metadata).
 */
export async function writeRowResult(
  options: SheetWriterOptions,
  result: WritebackResult,
): Promise<void> {
  const sheetName = options.sheetName ?? "Job Tracking";
  const creds = resolveGoogleCredentials();

  const auth = new GoogleAuth({
    scopes: SHEETS_SCOPES,
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });

  const sheets = google.sheets({ version: "v4", auth });
  const row = result.rowIndex;
  const completedAt = result.completedAt ?? new Date().toISOString();

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: options.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${sheetName}'!E${row}:F${row}`,
          values: [[result.status, completedAt]],
        },
        {
          range: `'${sheetName}'!J${row}:M${row}`,
          values: [[
            result.runId,
            result.outcome,
            result.error ?? "",
            completedAt,
          ]],
        },
      ],
    },
  });
}

/**
 * Write multiple row results back to the Google Sheet in a single batch call.
 */
export async function writeBatchResults(
  options: SheetWriterOptions,
  results: WritebackResult[],
): Promise<void> {
  if (results.length === 0) return;

  const sheetName = options.sheetName ?? "Job Tracking";
  const creds = resolveGoogleCredentials();

  const auth = new GoogleAuth({
    scopes: SHEETS_SCOPES,
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });

  const sheets = google.sheets({ version: "v4", auth });
  const now = new Date().toISOString();

  const data = results.flatMap((r) => {
    const completedAt = r.completedAt ?? now;
    return [
      {
        range: `'${sheetName}'!E${r.rowIndex}:F${r.rowIndex}`,
        values: [[r.status, completedAt]],
      },
      {
        range: `'${sheetName}'!J${r.rowIndex}:M${r.rowIndex}`,
        values: [[
          r.runId,
          r.outcome,
          r.error ?? "",
          completedAt,
        ]],
      },
    ];
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: options.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  });
}
