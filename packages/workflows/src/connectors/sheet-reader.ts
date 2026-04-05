import { SheetsClient, type GoogleAuthConfig } from "@dejsol/drive-connector";
import { AtsType, detectATS, isSupported } from "@dejsol/core";

export interface SheetRow {
  rowIndex: number;
  title: string;
  company: string;
  jobUrl: string;
  docLink: string;
  status: string;
  matchScore: number;
  ats: AtsType;
}

/**
 * Default column layout expected from the Resume API's deployed sheet:
 *   A: Title  B: Company  C: Job URL  D: Doc Link  E: Status  F: Score
 *
 * Adjustable via `range` if the sheet layout differs.
 */
export async function getPendingApplications(
  spreadsheetId: string,
  options: {
    sheetName?: string;
    range?: string;
    authConfig?: GoogleAuthConfig;
  } = {},
): Promise<SheetRow[]> {
  const sheetName = options.sheetName ?? "Sheet1";
  const range = options.range ?? `${sheetName}!A:F`;

  const client = new SheetsClient(
    options.authConfig ?? {
      keyFile: process.env["GOOGLE_CREDENTIALS_PATH"],
    },
  );

  const results = await client.batchReadRows(spreadsheetId, [range]);
  const rows = results[0] ?? [];

  // Skip header row (index 0); map remaining rows into SheetRow
  return rows
    .slice(1)
    .map((row, idx) => ({
      rowIndex: idx + 2, // 1-based, header is row 1
      title: row[0] ?? "",
      company: row[1] ?? "",
      jobUrl: row[2] ?? "",
      docLink: row[3] ?? "",
      status: row[4] ?? "",
      matchScore: parseInt(row[5] ?? "0", 10) || 0,
      ats: detectATS(row[2] ?? ""),
    }))
    .filter(
      (row) =>
        row.status.toLowerCase() === "pending" && isSupported(row.ats),
    );
}
