import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import {
  SHEET_COLUMNS,
  type BatchSheetUpdate,
  type GoogleAuthConfig,
} from "./types.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Retries a function up to maxAttempts times, backing off exponentially on
 * HTTP 429 (rate-limit) and 503 (service-unavailable) responses.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      if (attempt >= maxAttempts) throw err;

      const code =
        (err as { code?: number })?.code ??
        (err as { response?: { status?: number } })?.response?.status;

      if (code !== 429 && code !== 503) throw err;

      const delayMs = Math.min(1_000 * 2 ** attempt, 32_000);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Converts a 0-based column index to a spreadsheet column letter (A–Z only).
 * Supports sheets up to 26 columns, which covers SHEET_COLUMNS (16 cols).
 */
function colLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

const LAST_COL = colLetter(SHEET_COLUMNS.length - 1);

/**
 * Thin, quota-safe wrapper around the Google Sheets v4 API.
 *
 * Responsibilities:
 * - Batch-read arbitrary ranges from a spreadsheet.
 * - Batch-update multiple ranges in a single API call.
 * - Append individual rows.
 * - Look up the sheet row that corresponds to a given job ID.
 * - Ensure the header row is present before any data is written.
 */
export class SheetsClient {
  private readonly auth: GoogleAuth;

  constructor(config: GoogleAuthConfig = {}) {
    this.auth = new GoogleAuth({
      scopes: config.scopes ?? SHEETS_SCOPES,
      ...(config.keyFile ? { keyFile: config.keyFile } : {}),
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  }

  /**
   * Reads one or more A1-notation ranges and returns them in order.
   * Each element of the result is the 2-D array of cell values for that range.
   */
  async batchReadRows(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<string[][][]> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    const res = await withRetry(() =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
      }),
    );
    return (res.data.valueRanges ?? []).map((r) =>
      ((r.values ?? []) as string[][]).map((row) =>
        row.map((cell) => String(cell ?? "")),
      ),
    );
  }

  /**
   * Writes multiple ranges to the sheet in a single batchUpdate call.
   * All values must be pre-serialised to strings.
   */
  async batchUpdateRows(
    spreadsheetId: string,
    updates: BatchSheetUpdate[],
  ): Promise<void> {
    if (updates.length === 0) return;

    const sheets = google.sheets({ version: "v4", auth: this.auth });
    const data: sheets_v4.Schema$ValueRange[] = updates.map((u) => ({
      range: u.range,
      values: u.values,
    }));

    await withRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data,
        },
      }),
    );
  }

  /**
   * Appends a single row below the last row of data in the given sheet.
   */
  async appendRow(
    spreadsheetId: string,
    sheetName: string,
    values: string[],
  ): Promise<void> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    await withRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [values] },
      }),
    );
  }

  /**
   * Scans column A of the given sheet for a matching jobId.
   * Returns the 1-based row number or null if not found.
   */
  async findRowByJobId(
    spreadsheetId: string,
    sheetName: string,
    jobId: string,
  ): Promise<number | null> {
    const results = await this.batchReadRows(spreadsheetId, [
      `${sheetName}!A:A`,
    ]);
    const colA = results[0] ?? [];
    for (let i = 0; i < colA.length; i++) {
      if (colA[i]?.[0] === jobId) return i + 1;
    }
    return null;
  }

  /**
   * Reads all job IDs from column A of the given sheet and returns a map of
   * jobId → 1-based row number. Row 1 (header) is excluded.
   *
   * Fetching the entire column once and building a map is more efficient than
   * calling findRowByJobId per job when syncing many rows.
   */
  async buildJobIdRowMap(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<Map<string, number>> {
    const results = await this.batchReadRows(spreadsheetId, [
      `${sheetName}!A:A`,
    ]);
    const colA = results[0] ?? [];
    const map = new Map<string, number>();
    for (let i = 1; i < colA.length; i++) {
      const id = colA[i]?.[0];
      if (id) map.set(id, i + 1); // i is 0-based; row 1 is the header
    }
    return map;
  }

  /**
   * Ensures the header row is present in row 1. Writes it if row 1 is empty.
   */
  async ensureHeader(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<void> {
    const results = await this.batchReadRows(spreadsheetId, [
      `${sheetName}!A1:${LAST_COL}1`,
    ]);
    const firstRow = results[0]?.[0] ?? [];
    if (firstRow.length === 0) {
      await this.appendRow(spreadsheetId, sheetName, [...SHEET_COLUMNS]);
    }
  }
}
