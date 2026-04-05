import { SheetsClient, type GoogleAuthConfig } from "@dejsol/drive-connector";

export type ApplicationStatus =
  | "submitted"
  | "verification_required"
  | "failed"
  | "skipped"
  | "pending_lever"
  | "needs_review";

/**
 * Writes the application outcome back to the tracking sheet row.
 *
 * Updates columns E–H on the given row:
 *   E: status
 *   F: confirmation URL (or empty)
 *   G: timestamp
 *   H: run ID
 */
export async function updateApplicationStatus(
  spreadsheetId: string,
  rowIndex: number,
  status: ApplicationStatus,
  options: {
    confirmationUrl?: string;
    runId?: string;
    sheetName?: string;
    authConfig?: GoogleAuthConfig;
  } = {},
): Promise<void> {
  const sheetName = options.sheetName ?? "Sheet1";

  const client = new SheetsClient(
    options.authConfig ?? {
      keyFile: process.env["GOOGLE_CREDENTIALS_PATH"],
    },
  );

  await client.batchUpdateRows(spreadsheetId, [
    {
      range: `${sheetName}!E${rowIndex}:H${rowIndex}`,
      values: [
        [
          status,
          options.confirmationUrl ?? "",
          new Date().toISOString(),
          options.runId ?? "",
        ],
      ],
    },
  ]);
}
