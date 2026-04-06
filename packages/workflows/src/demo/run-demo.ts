/**
 * Demo CLI — runs the full batch pipeline and prints a clean summary.
 *
 * Two modes:
 *   DEMO_SOURCE=local (default)
 *     Reads from a local JSON/CSV file (demo-input.json)
 *
 *   DEMO_SOURCE=google
 *     Reads pending rows from a real Google Sheet, exports resumes
 *     from Google Drive, executes applications, writes results back.
 *
 * Candidate data is loaded from candidate.json (co-located with this file).
 * No CANDIDATE_* env vars are required.
 *
 * Usage:
 *   # Local mode (default)
 *   node --require tsx/cjs src/demo/run-demo.ts
 *
 *   # Google Sheets mode
 *   DEMO_SOURCE=google node --require tsx/cjs src/demo/run-demo.ts
 *
 * Env vars:
 *   DEMO_SOURCE          — "local" (default) or "google"
 *   GOOGLE_SHEET_ID      — Spreadsheet ID (Google mode)
 *   GOOGLE_SHEET_NAME    — Sheet tab name (default: "Job Tracking")
 *   DEMO_LIMIT           — Max rows to process (0 = unlimited)
 */

import { resolve } from "node:path";
import { readApplicationSheet } from "./sheet-reader.js";
import { runBatch, runGoogleBatch } from "./batch-runner.js";
import type { BatchRunResult, BatchSummary } from "./batch-runner.js";
import { readPendingRows } from "../connectors/sheet-reader.js";
import { loadCandidateProfile } from "./load-candidate.js";

const DIVIDER = "─".repeat(45);

function printHeader(total: number, mode: string): void {
  console.log();
  console.log(`[DEMO] ${DIVIDER}`);
  console.log(`[DEMO]  Greenhouse Apply — Batch Demo`);
  console.log(`[DEMO]  Mode: ${mode}`);
  console.log(`[DEMO] ${DIVIDER}`);
  console.log(`[DEMO]  Loading ${total} job application(s)…`);
  console.log(`[DEMO] ${DIVIDER}`);
}

function printProgress(
  completed: number,
  total: number,
  result: BatchRunResult,
): void {
  const icon =
    result.outcome === "SUBMITTED"
      ? "✓"
      : result.outcome === "VERIFICATION_REQUIRED"
        ? "✓"
        : result.outcome === "SKIPPED"
          ? "⊘"
          : "✗";
  const displayOutcome = result.outcome === "VERIFICATION_REQUIRED"
    ? "SUBMITTED (verify)"
    : result.outcome;
  const duration = (result.durationMs / 1000).toFixed(1);

  console.log(
    `[DEMO]  ${icon} [${completed}/${total}] ${result.candidate} — ${displayOutcome} (${duration}s)`,
  );
}

function printSummary(summary: BatchSummary): void {
  console.log();
  console.log(`[DEMO] ${DIVIDER}`);
  console.log(`[DEMO]  Total jobs:    ${summary.totalJobs}`);
  console.log(`[DEMO]  Submitted:     ${summary.submitted}`);
  if (summary.verification > 0) {
    console.log(`[DEMO]  Submitted (verify): ${summary.verification}  ← form submitted, awaiting email code`);
  }
  console.log(`[DEMO]  Failed:        ${summary.failed}`);
  if (summary.skipped > 0) {
    console.log(`[DEMO]  Skipped:       ${summary.skipped}`);
  }
  console.log(`[DEMO]  Success rate:  ${summary.successRate}`);
  console.log(`[DEMO] ${DIVIDER}`);
  console.log(`[DEMO]  Results saved: artifacts-batch/run-results.json`);
  console.log(`[DEMO] ${DIVIDER}`);
  console.log();
}

async function runLocalMode(): Promise<void> {
  const inputPath = resolve(
    process.argv[2] ?? "./demo-input.json",
  );

  let rows;
  try {
    rows = readApplicationSheet(inputPath);
  } catch (err) {
    console.error(
      `[DEMO] Failed to load input file: ${inputPath}`,
    );
    console.error(
      `[DEMO] ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (rows.length === 0) {
    console.error("[DEMO] No application rows found in input file.");
    process.exit(1);
  }

  printHeader(rows.length, "local");

  const summary = await runBatch(rows, {
    artifactDir: resolve("./artifacts-batch"),
    outputPath: resolve("./artifacts-batch/run-results.json"),
    quiet: true,
    onProgress: printProgress,
  });

  printSummary(summary);
}

async function runGoogleMode(): Promise<void> {
  const spreadsheetId = process.env["GOOGLE_SHEET_ID"];
  if (!spreadsheetId) {
    console.error("[DEMO] GOOGLE_SHEET_ID is required in Google mode.");
    process.exit(1);
  }

  const candidate = loadCandidateProfile();
  console.log(`[DEMO] Candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);
  console.log(`[DEMO] Phone: ${candidate.phone} | City: ${candidate.city} | State: ${candidate.state}`);

  const sheetName = process.env["GOOGLE_SHEET_NAME"] ?? "Job Tracking";

  console.log(`[DEMO] Reading pending rows from Google Sheet (tab: ${sheetName})…`);

  let rows;
  try {
    rows = await readPendingRows(
      { spreadsheetId, sheetName },
      {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        phone: candidate.phone,
      },
    );
  } catch (err) {
    console.error("[DEMO] Failed to read Google Sheet:");
    console.error(
      `[DEMO] ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log("[DEMO] No pending application rows found in sheet.");
    process.exit(0);
  }

  const limit = parseInt(process.env["DEMO_LIMIT"] ?? "0", 10);
  if (limit > 0 && rows.length > limit) {
    console.log(`[DEMO] Found ${rows.length} pending row(s), limiting to ${limit} (DEMO_LIMIT).`);
    rows = rows.slice(0, limit);
  } else {
    console.log(`[DEMO] Found ${rows.length} pending row(s).`);
  }

  for (const r of rows.slice(0, 3)) {
    console.log(`[DEMO]   Row ${r.rowIndex}: ${r.company} — ${r.jobTitle} (${r.resumeId})`);
  }

  printHeader(rows.length, "google");

  const headless = process.env["BROWSER_HEADLESS"]?.toLowerCase() !== "false";

  const summary = await runGoogleBatch(rows, {
    spreadsheetId,
    sheetName,
    artifactDir: resolve("./artifacts-batch"),
    outputPath: resolve("./artifacts-batch/run-results.json"),
    quiet: true,
    headless,
    candidateProfile: {
      city: candidate.city,
      state: candidate.state,
      country: candidate.country,
    },
    onProgress: printProgress,
  });

  printSummary(summary);
}

async function main(): Promise<void> {
  const source = (process.env["DEMO_SOURCE"] ?? "local").toLowerCase().trim();

  if (source === "google") {
    await runGoogleMode();
  } else {
    await runLocalMode();
  }
}

const _scriptPath = process.argv[1] ?? "";
if (
  _scriptPath.endsWith("run-demo.ts") ||
  _scriptPath.endsWith("run-demo.js")
) {
  main().catch((err: unknown) => {
    console.error("[DEMO] Fatal error:", err);
    process.exit(1);
  });
}
