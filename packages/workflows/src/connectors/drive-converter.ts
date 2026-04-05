/**
 * Drive Converter — exports a Google Doc to PDF for Playwright upload.
 *
 * Accepts:
 *   - Google Docs URL (https://docs.google.com/document/d/FILE_ID/...)
 *   - Google Drive URL (https://drive.google.com/file/d/FILE_ID/...)
 *   - Raw Google Drive file ID
 *   - Local file path (returned as-is)
 *
 * Exports the Doc as PDF and saves it to the local artifacts directory.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { resolveGoogleCredentials } from "./google-auth.js";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const PDF_MIME = "application/pdf";

/**
 * Extract a Google Drive/Docs file ID from various URL formats.
 * Returns null if the input doesn't match any known pattern.
 */
export function extractFileId(input: string): string | null {
  if (!input) return null;

  // https://docs.google.com/document/d/FILE_ID/edit
  const docsMatch = input.match(
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (docsMatch) return docsMatch[1];

  // https://drive.google.com/file/d/FILE_ID/view
  const driveMatch = input.match(
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (driveMatch) return driveMatch[1];

  // https://drive.google.com/open?id=FILE_ID
  const openMatch = input.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  // Raw file ID (no slashes, reasonable length)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input;

  return null;
}

/**
 * Check if a string looks like a local file path rather than a Google link.
 */
function isLocalPath(input: string): boolean {
  return (
    input.startsWith("/") ||
    input.startsWith("./") ||
    input.startsWith("../" ) ||
    /^[a-zA-Z]:\\/.test(input)
  );
}

export interface ConvertOptions {
  outputDir?: string;
  filename?: string;
}

/**
 * Convert a resume link to a local PDF file path.
 *
 * - If the link is a local file path, returns it as-is.
 * - If it's a Google Doc/Drive link, exports it as PDF to the output directory.
 *
 * Returns the absolute path to the local PDF file.
 */
export async function convertResumeToPdf(
  resumeLink: string,
  options?: ConvertOptions,
): Promise<string> {
  if (isLocalPath(resumeLink)) {
    return resolve(resumeLink);
  }

  const fileId = extractFileId(resumeLink);
  if (!fileId) {
    throw new Error(
      `Cannot extract Google file ID from: ${resumeLink}`,
    );
  }

  const outputDir = resolve(options?.outputDir ?? "./artifacts-batch/resumes");
  mkdirSync(outputDir, { recursive: true });

  const creds = resolveGoogleCredentials();
  const auth = new GoogleAuth({
    scopes: DRIVE_SCOPES,
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });

  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({
    fileId,
    fields: "id, name, mimeType",
  });

  const mimeType = meta.data.mimeType ?? "";
  const baseName =
    options?.filename ??
    (meta.data.name ?? fileId).replace(/\.[^.]+$/, "");
  const pdfPath = join(outputDir, `${baseName}.pdf`);

  if (mimeType === GOOGLE_DOC_MIME) {
    const res = await drive.files.export(
      { fileId, mimeType: PDF_MIME },
      { responseType: "arraybuffer" },
    );
    writeFileSync(pdfPath, Buffer.from(res.data as ArrayBuffer));
  } else if (mimeType === PDF_MIME) {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    writeFileSync(pdfPath, Buffer.from(res.data as ArrayBuffer));
  } else {
    const res = await drive.files.export(
      { fileId, mimeType: PDF_MIME },
      { responseType: "arraybuffer" },
    );
    writeFileSync(pdfPath, Buffer.from(res.data as ArrayBuffer));
  }

  return pdfPath;
}
