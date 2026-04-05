/**
 * Google Sheets Reader — reads pending application rows from a real Google Sheet.
 *
 * Real sheet layout ("Job Tracking" tab, row 1 is header):
 *   A: # (resume id)  | B: Job Title    | C: Company  | D: Location
 *   E: Status         | F: Application Date | G: Application URL
 *   H: Resume Link    | I: Notes
 *   J: run_id         | K: outcome      | L: error    | M: completed_at
 *
 * Only rows where column E (Status) is "Not Applied" or empty are returned.
 * resume_link (col H) can be a Google Docs URL, a Google Drive file ID,
 * or a local path.
 *
 * Candidate info (firstName, lastName, email, phone) is NOT in the sheet —
 * it's a single-user job tracker. The caller provides candidate details
 * via the CandidateInfo argument.
 */

import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { resolveGoogleCredentials } from "./google-auth.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export interface SheetApplicationRow {
  rowIndex: number;
  resumeId: string;
  jobTitle: string;
  company: string;
  location: string;
  status: string;
  applicationDate: string;
  jobUrl: string;
  resumeLink: string;
  notes: string;
  /** Injected by the caller — not from the sheet. */
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface SheetReaderOptions {
  spreadsheetId: string;
  sheetName?: string;
  credentialsPath?: string;
}

export interface CandidateInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/**
 * Read pending application rows from a Google Sheet.
 * Returns rows where Status (col E) is "Not Applied" or empty.
 *
 * Candidate info is injected into each row from the provided CandidateInfo.
 * The caller MUST supply candidate data — there are no env var fallbacks.
 */
export async function readPendingRows(
  options: SheetReaderOptions,
  candidate?: CandidateInfo,
): Promise<SheetApplicationRow[]> {
  const sheetName = options.sheetName ?? "Job Tracking";
  const creds = resolveGoogleCredentials();

  const auth = new GoogleAuth({
    scopes: SHEETS_SCOPES,
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });

  const sheets = google.sheets({ version: "v4", auth });

  const range = `'${sheetName}'!A2:M`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: options.spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rawRows = (res.data.values ?? []) as string[][];
  const pending: SheetApplicationRow[] = [];

  const firstName = candidate?.firstName ?? "Candidate";
  const lastName = candidate?.lastName ?? "Unknown";
  const email = candidate?.email ?? "missing@example.com";
  const phone = candidate?.phone ?? "";

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const status = String(row[4] ?? "").trim();
    const statusLower = status.toLowerCase();

    if (statusLower !== "" && statusLower !== "not applied" && statusLower !== "pending") continue;

    const jobUrl = String(row[6] ?? "").trim();
    if (!jobUrl) continue;

    pending.push({
      rowIndex: i + 2,
      resumeId: String(row[0] ?? "").trim(),
      jobTitle: String(row[1] ?? "").trim(),
      company: String(row[2] ?? "").trim(),
      location: String(row[3] ?? "").trim(),
      status: status || "Not Applied",
      applicationDate: String(row[5] ?? "").trim(),
      jobUrl,
      resumeLink: String(row[7] ?? "").trim(),
      notes: String(row[8] ?? "").trim(),
      firstName,
      lastName,
      email,
      phone,
    });
  }

  return pending;
}
