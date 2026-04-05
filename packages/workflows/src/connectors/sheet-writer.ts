/**
 * Google Sheets Writer — writes status/results back to a Google Sheet.
 *
 * Updates specific cells in a row to reflect the outcome of an application run.
 * Aligned with the sheet layout defined in sheet-reader.ts:
 *   A: status | B: job_url | C: first_name | D: last_name | E: email
 *   F: phone | G: resume_link | H: company | I: job_title
 *   J: run_id | K: outcome | L: error | M: completed_at
 */

import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { resolveGoogleCredentials } from "./google-auth.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export type WritebackStatus =
  | "submitted"
  | "verification_required"
  | "failed"
  | "skipped"
  | "pending_lever"
  | "needs_review";

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
 * Updates columns A (status), J (run_id), K (outcome), L (error), M (completed_at).
 */
export async function writeRowResult(
  options: SheetWriterOptions,
  result: WritebackResult,
): Promise<void> {
  const sheetName = options.sheetName ?? "Applications";
  const creds = resolveGoogleCredentials();

  const auth = new GoogleAuth({
    scopes: SHEETS_SCOPES,
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });

  const sheets = google.sheets({ version: "v4", auth });
  const row = result.rowIndex;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: options.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `${sheetName}!A${row}`,
          values: [[result.status]],
        },
        {
          range: `${sheetName}!J${row}:M${row}`,
          values: [[
            result.runId,
            result.outcome,
            result.error ?? "",
            result.completedAt ?? new Date().toISOString(),
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

  const sheetName = options.sheetName ?? "Applications";
  const creds = resolveGoogleCredentials();

  const auth = new GoogleAuth({
    scopes: SHEETS_SCOPES,
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });

  const sheets = google.sheets({ version: "v4", auth });

  const data = results.flatMap((r) => [
    {
      range: `${sheetName}!A${r.rowIndex}`,
      values: [[r.status]],
    },
    {
      range: `${sheetName}!J${r.rowIndex}:M${r.rowIndex}`,
      values: [[
        r.runId,
        r.outcome,
        r.error ?? "",
        r.completedAt ?? new Date().toISOString(),
      ]],
    },
  ]);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: options.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  });
}
