/**
 * Google Auth — shared authentication factory for Google API connectors.
 *
 * Reads service-account credentials from:
 *   1. GOOGLE_CREDENTIALS_PATH env var (path to JSON key file)
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var (standard Google SDK fallback)
 *
 * All connectors share a single auth instance per process.
 */

import { readFileSync } from "node:fs";

export interface GoogleCredentials {
  keyFile?: string;
  credentials?: object;
}

/**
 * Resolve Google credentials from environment.
 * Throws if no credentials are found.
 */
export function resolveGoogleCredentials(): GoogleCredentials {
  const credPath =
    process.env["GOOGLE_CREDENTIALS_PATH"] ??
    process.env["GOOGLE_APPLICATION_CREDENTIALS"];

  if (credPath) {
    return { keyFile: credPath };
  }

  const credJson = process.env["GOOGLE_CREDENTIALS_JSON"];
  if (credJson) {
    return { credentials: JSON.parse(credJson) };
  }

  throw new Error(
    "No Google credentials found. Set GOOGLE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS.",
  );
}
