/**
 * Google Sheets Reader — reads pending application rows from a real Google Sheet.
 *
 * Expected sheet layout (row 1 is header):
 *   A: status | B: job_url | C: first_name | D: last_name | E: email
 *   F: phone | G: resume_link | H: company | I: job_title
 *   J: run_id | K: outcome | L: error | M: completed_at
 *
 * Only rows where column A (status) is empty or "pending" are returned.
 * resume_link can be a Google Docs URL, a Google Drive file ID, or a local path.
 */

import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { resolveGoogleCredentials } from "./google-auth.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export interface SheetApplicationRow {
  rowIndex: number;
  status: string;
  jobUrl: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  resumeLink: string;
  company: string;
  jobTitle: string;
}

export interface SheetReaderOptions {
  spreadsheetId: string;
  sheetName?: string;
  credentialsPath?: string;
}

/**
 * Read pending application rows from a Google Sheet.
 * Returns rows where status is empty or "pending".
 */
export async function readPendingRows(
  options: SheetReaderOptions,
): Promise<SheetApplicationRow[]> {
  const sheetName = options.sheetName ?? "Applications";
  const creds = resolveGoogleCredentials();

  const auth = new GoogleAuth({
    scopes: SHEETS_SCOPES,
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });

  const sheets = google.sheets({ version: "v4", auth });

  const range = `${sheetName}!A2:M`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: options.spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rawRows = (res.data.values ?? []) as string[][];
  const pending: SheetApplicationRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const status = String(row[0] ?? "").trim().toLowerCase();

    if (status !== "" && status !== "pending") continue;

    const jobUrl = String(row[1] ?? "").trim();
    const firstName = String(row[2] ?? "").trim();
    const lastName = String(row[3] ?? "").trim();
    const email = String(row[4] ?? "").trim();

    if (!jobUrl || !firstName || !lastName || !email) continue;

    pending.push({
      rowIndex: i + 2,
      status: status || "pending",
      jobUrl,
      firstName,
      lastName,
      email,
      phone: String(row[5] ?? "").trim(),
      resumeLink: String(row[6] ?? "").trim(),
      company: String(row[7] ?? "").trim(),
      jobTitle: String(row[8] ?? "").trim(),
    });
  }

  return pending;
}
