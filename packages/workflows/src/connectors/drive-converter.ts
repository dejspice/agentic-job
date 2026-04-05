import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import type { GoogleAuthConfig } from "@dejsol/drive-connector";
import * as path from "node:path";
import * as fs from "node:fs";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

/**
 * Extract the Google Drive file ID from a variety of URL formats:
 *   - https://docs.google.com/document/d/FILE_ID/edit
 *   - https://drive.google.com/file/d/FILE_ID/view
 *   - https://drive.google.com/open?id=FILE_ID
 */
export function extractDriveFileId(url: string): string {
  const pathMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];

  const queryMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];

  throw new Error(`Cannot extract Drive file ID from: ${url}`);
}

/**
 * Downloads a Google Doc as a PDF file.
 *
 * Takes the Google Doc link from the tracking sheet, exports it as PDF via
 * the Drive v3 API, and writes it to `outputDir`. Returns the absolute path
 * to the saved PDF — ready for Playwright file-upload.
 */
export async function downloadResumeAsPDF(
  docLink: string,
  outputDir: string,
  authConfig?: GoogleAuthConfig,
): Promise<string> {
  const auth = new GoogleAuth({
    scopes: DRIVE_SCOPES,
    ...(authConfig?.keyFile
      ? { keyFile: authConfig.keyFile }
      : { keyFile: process.env["GOOGLE_CREDENTIALS_PATH"] }),
    ...(authConfig?.credentials
      ? { credentials: authConfig.credentials }
      : {}),
  });

  const drive = google.drive({ version: "v3", auth });
  const fileId = extractDriveFileId(docLink);

  const response = await drive.files.export(
    { fileId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" },
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `resume_${fileId}.pdf`);
  fs.writeFileSync(outputPath, Buffer.from(response.data as ArrayBuffer));

  return outputPath;
}
