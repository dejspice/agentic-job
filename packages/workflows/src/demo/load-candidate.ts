/**
 * Candidate Profile Loader — structured candidate data for demo/google pipeline.
 *
 * Loads candidate profile from a JSON file and validates required fields.
 * This is the single entry point for candidate data in demo and google modes.
 *
 * Current source: candidate.json (co-located with this file).
 * Future sources: DB query, API call, CLI arg — swap the read logic here
 * without touching batch-runner, harness, or any downstream consumer.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DemoCandidateProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
}

const REQUIRED_FIELDS: ReadonlyArray<keyof DemoCandidateProfile> = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "state",
  "country",
];

/**
 * Load the candidate profile for demo/google pipeline runs.
 *
 * Resolution order:
 *   1. overridePath argument (for programmatic callers)
 *   2. CANDIDATE_PROFILE env var (absolute or relative path)
 *   3. Default: src/demo/candidate.json (relative to cwd)
 *
 * Validates that all required fields are present and non-empty.
 * Throws with a clear message if any field is missing.
 */
export function loadCandidateProfile(overridePath?: string): DemoCandidateProfile {
  const envPath = process.env["CANDIDATE_PROFILE"]?.trim();
  const defaultPath = resolve(process.cwd(), "src", "demo", "candidate.json");
  const filePath = overridePath ?? (envPath ? resolve(envPath) : defaultPath);

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Cannot read candidate profile from ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in candidate profile: ${filePath}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Candidate profile must be a JSON object: ${filePath}`);
  }

  const obj = parsed as Record<string, unknown>;
  const missing: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const val = obj[field];
    if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Candidate profile is missing required fields: ${missing.join(", ")}\n` +
      `  File: ${filePath}\n` +
      `  Required: ${REQUIRED_FIELDS.join(", ")}`,
    );
  }

  return {
    firstName: String(obj.firstName).trim(),
    lastName: String(obj.lastName).trim(),
    email: String(obj.email).trim(),
    phone: String(obj.phone).trim(),
    city: String(obj.city).trim(),
    state: String(obj.state).trim(),
    country: String(obj.country).trim(),
  };
}
