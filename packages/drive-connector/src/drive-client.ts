import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import type { CandidateAsset, DriveFile, GoogleAuthConfig } from "./types.js";
import type { AssetKind } from "./types.js";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

const RESUME_RE = /resume|(\bcv\b)/i;
const COVER_LETTER_RE = /cover[_\s-]?letter|\bcl[_\s]/i;

function classifyAsset(name: string): AssetKind {
  if (RESUME_RE.test(name)) return "resume";
  if (COVER_LETTER_RE.test(name)) return "cover_letter";
  return "other";
}

function toDriveFile(item: {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
  parents?: string[] | null;
}): DriveFile {
  return {
    id: item.id ?? "",
    name: item.name ?? "",
    mimeType: item.mimeType ?? "",
    size: item.size != null ? parseInt(item.size, 10) : null,
    createdTime: item.createdTime ?? null,
    modifiedTime: item.modifiedTime ?? null,
    webViewLink: item.webViewLink ?? null,
    parents: item.parents ?? [],
  };
}

/**
 * Thin wrapper around the Google Drive v3 API.
 *
 * Responsibilities:
 * - List candidate asset files (resumes, cover letters) from a Drive folder.
 * - Fetch individual file metadata by ID.
 * - Classify files by kind based on their name.
 */
export class DriveClient {
  private readonly auth: GoogleAuth;

  constructor(config: GoogleAuthConfig = {}) {
    this.auth = new GoogleAuth({
      scopes: config.scopes ?? DRIVE_SCOPES,
      ...(config.keyFile ? { keyFile: config.keyFile } : {}),
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  }

  /**
   * Lists all non-trashed files in a candidate's Drive folder and classifies
   * each file as resume, cover_letter, or other.
   *
   * Handles pagination automatically.
   */
  async listCandidateAssets(folderId: string): Promise<CandidateAsset[]> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    const assets: CandidateAsset[] = [];
    let pageToken: string | undefined;

    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields:
          "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, parents)",
        pageSize: 100,
        ...(pageToken ? { pageToken } : {}),
      });

      for (const item of res.data.files ?? []) {
        const file = toDriveFile(item);
        assets.push({ ...file, kind: classifyAsset(file.name) });
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return assets;
  }

  /** Fetches metadata for a single Drive file by ID. */
  async getFileMetadata(fileId: string): Promise<DriveFile> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    const res = await drive.files.get({
      fileId,
      fields:
        "id, name, mimeType, size, createdTime, modifiedTime, webViewLink, parents",
    });
    return toDriveFile(res.data);
  }
}
