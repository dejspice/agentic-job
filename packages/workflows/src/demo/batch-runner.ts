/**
 * Batch Runner — executes multiple Greenhouse applications sequentially.
 *
 * Supports two modes:
 *   - "local": reads rows from ApplicationRow[] (local JSON/CSV)
 *   - "google": reads from Google Sheets, exports resumes from Drive,
 *               writes results back to the Sheet
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApplicationRow } from "./sheet-reader.js";
import { runGreenhouseApplication } from "../harness/greenhouse-live-harness.js";
import type { ApplicationResult } from "../harness/greenhouse-live-harness.js";
import { detectATS, isSupported } from "@dejsol/core";
import { convertResumeToPdf } from "../connectors/drive-converter.js";
import { writeRowResult } from "../connectors/sheet-writer.js";
import type { WritebackStatus } from "../connectors/sheet-writer.js";
import type { SheetApplicationRow } from "../connectors/sheet-reader.js";

export interface BatchRunResult {
  runId: string;
  jobUrl: string;
  candidate: string;
  candidateEmail?: string;
  company?: string;
  jobTitle?: string;
  outcome: "SUBMITTED" | "VERIFICATION_REQUIRED" | "FAILED" | "SKIPPED";
  durationMs: number;
  verificationRequired: boolean;
  error?: string;
  sheetRowIndex?: number;
}

export interface BatchSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  totalJobs: number;
  submitted: number;
  verification: number;
  failed: number;
  skipped: number;
  successRate: string;
  results: BatchRunResult[];
}

function outcomeToWritebackStatus(outcome: BatchRunResult["outcome"]): WritebackStatus {
  switch (outcome) {
    case "SUBMITTED": return "Applied";
    case "VERIFICATION_REQUIRED": return "Verification Required";
    case "FAILED": return "Failed";
    case "SKIPPED": return "Skipped";
  }
}

/**
 * Run a batch of applications from local ApplicationRow data.
 */
export async function runBatch(
  rows: ApplicationRow[],
  options?: {
    artifactDir?: string;
    outputPath?: string;
    quiet?: boolean;
    headless?: boolean;
    onProgress?: (completed: number, total: number, result: BatchRunResult) => void;
  },
): Promise<BatchSummary> {
  const batchId = randomUUID().slice(0, 8);
  const artifactDir = resolve(options?.artifactDir ?? "./artifacts-batch");
  const outputPath = resolve(
    options?.outputPath ?? "./artifacts-batch/run-results.json",
  );
  const quiet = options?.quiet ?? false;
  const headless = options?.headless ?? (process.env["BROWSER_HEADLESS"]?.toLowerCase() !== "false");

  const results: BatchRunResult[] = [];
  const startedAt = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const candidateName = `${row.firstName} ${row.lastName}`;

    if (!quiet) {
      console.log(
        `\n[BATCH] [${i + 1}/${rows.length}] ${candidateName} → ${row.jobUrl}`,
      );
    }

    const start = Date.now();

    let appResult: ApplicationResult;
    try {
      appResult = await runGreenhouseApplication(
        {
          jobUrl: row.jobUrl,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          resumePath: row.resumePath,
        },
        {
          artifactDir,
          quiet,
          headless,
        },
      );
    } catch (err) {
      appResult = {
        outcome: "FAILED",
        runId: randomUUID(),
        verificationRequired: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const durationMs = Date.now() - start;

    const batchResult: BatchRunResult = {
      runId: appResult.runId,
      jobUrl: row.jobUrl,
      candidate: candidateName,
      outcome: appResult.outcome,
      durationMs,
      verificationRequired: appResult.verificationRequired,
      ...(appResult.error ? { error: appResult.error } : {}),
    };

    results.push(batchResult);

    if (options?.onProgress) {
      options.onProgress(i + 1, rows.length, batchResult);
    }

    if (!quiet) {
      const icon =
        appResult.outcome === "SUBMITTED"
          ? "✓"
          : appResult.outcome === "VERIFICATION_REQUIRED"
            ? "⏳"
            : "✗";
      console.log(
        `[BATCH] ${icon} ${appResult.outcome} (${(durationMs / 1000).toFixed(1)}s)`,
      );
    }
  }

  return finalizeBatch(batchId, startedAt, results, rows.length, outputPath);
}

/**
 * Run a batch of applications from Google Sheets rows.
 *
 * For each row:
 *   1. Check ATS support (skip unsupported)
 *   2. Export resume from Google Drive to local PDF
 *   3. Execute the Greenhouse apply flow
 *   4. Write result back to the Google Sheet
 */
export interface CandidateProfileFields {
  city?: string;
  state?: string;
  country?: string;
}

export async function runGoogleBatch(
  rows: SheetApplicationRow[],
  options: {
    spreadsheetId: string;
    sheetName?: string;
    artifactDir?: string;
    outputPath?: string;
    quiet?: boolean;
    headless?: boolean;
    candidateProfile?: CandidateProfileFields;
    onProgress?: (completed: number, total: number, result: BatchRunResult) => void;
  },
): Promise<BatchSummary> {
  const batchId = randomUUID().slice(0, 8);
  const artifactDir = resolve(options.artifactDir ?? "./artifacts-batch");
  const outputPath = resolve(
    options.outputPath ?? "./artifacts-batch/run-results.json",
  );
  const quiet = options.quiet ?? false;
  const headless = options.headless ?? (process.env["BROWSER_HEADLESS"]?.toLowerCase() !== "false");

  const results: BatchRunResult[] = [];
  const startedAt = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const candidateName = `${row.firstName} ${row.lastName}`;

    if (!quiet) {
      console.log(
        `\n[BATCH] [${i + 1}/${rows.length}] ${candidateName} → ${row.jobUrl}`,
      );
    }

    const start = Date.now();

    const ats = detectATS(row.jobUrl);
    if (!isSupported(ats)) {
      const durationMs = Date.now() - start;
      const batchResult: BatchRunResult = {
        runId: randomUUID(),
        jobUrl: row.jobUrl,
        candidate: candidateName,
        candidateEmail: row.email,
        company: row.company,
        jobTitle: row.jobTitle,
        outcome: "SKIPPED",
        durationMs,
        verificationRequired: false,
        error: `Unsupported ATS: ${ats}`,
        sheetRowIndex: row.rowIndex,
      };
      results.push(batchResult);

      try {
        await writeRowResult(
          { spreadsheetId: options.spreadsheetId, sheetName: options.sheetName },
          {
            rowIndex: row.rowIndex,
            status: "Skipped",
            runId: batchResult.runId,
            outcome: "SKIPPED",
            error: `Unsupported ATS: ${ats}`,
            completedAt: new Date().toISOString(),
          },
        );
      } catch {
        // Writeback failure is non-fatal
      }

      if (options.onProgress) {
        options.onProgress(i + 1, rows.length, batchResult);
      }
      continue;
    }

    let resumePath: string;
    try {
      if (!quiet) console.log(`[BATCH]   Exporting resume…`);
      resumePath = await convertResumeToPdf(row.resumeLink, {
        outputDir: resolve(artifactDir, "resumes"),
        filename: `${row.firstName}-${row.lastName}-resume`,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      const batchResult: BatchRunResult = {
        runId: randomUUID(),
        jobUrl: row.jobUrl,
        candidate: candidateName,
        candidateEmail: row.email,
        company: row.company,
        jobTitle: row.jobTitle,
        outcome: "FAILED",
        durationMs,
        verificationRequired: false,
        error: `Resume export failed: ${err instanceof Error ? err.message : String(err)}`,
        sheetRowIndex: row.rowIndex,
      };
      results.push(batchResult);

      try {
        await writeRowResult(
          { spreadsheetId: options.spreadsheetId, sheetName: options.sheetName },
          {
            rowIndex: row.rowIndex,
            status: "Failed",
            runId: batchResult.runId,
            outcome: "FAILED",
            error: batchResult.error,
            completedAt: new Date().toISOString(),
          },
        );
      } catch {
        // Writeback failure is non-fatal
      }

      if (options.onProgress) {
        options.onProgress(i + 1, rows.length, batchResult);
      }
      continue;
    }

    const profile = options.candidateProfile;
    const location = profile?.city && profile?.state
      ? `${profile.city}, ${profile.state}`
      : profile?.city ?? profile?.state;

    let appResult: ApplicationResult;
    try {
      appResult = await runGreenhouseApplication(
        {
          jobUrl: row.jobUrl,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          resumePath,
          city: profile?.city,
          state: profile?.state,
          country: profile?.country,
          location,
        },
        {
          artifactDir,
          quiet,
          headless,
        },
      );
    } catch (err) {
      appResult = {
        outcome: "FAILED",
        runId: randomUUID(),
        verificationRequired: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const durationMs = Date.now() - start;

    const batchResult: BatchRunResult = {
      runId: appResult.runId,
      jobUrl: row.jobUrl,
      candidate: candidateName,
      candidateEmail: row.email,
      company: row.company,
      jobTitle: row.jobTitle,
      outcome: appResult.outcome,
      durationMs,
      verificationRequired: appResult.verificationRequired,
      sheetRowIndex: row.rowIndex,
      ...(appResult.error ? { error: appResult.error } : {}),
    };

    results.push(batchResult);

    try {
      await writeRowResult(
        { spreadsheetId: options.spreadsheetId, sheetName: options.sheetName },
        {
          rowIndex: row.rowIndex,
          status: outcomeToWritebackStatus(appResult.outcome),
          runId: appResult.runId,
          outcome: appResult.outcome,
          error: appResult.error,
          completedAt: new Date().toISOString(),
        },
      );
    } catch {
      // Writeback failure is non-fatal
    }

    if (options.onProgress) {
      options.onProgress(i + 1, rows.length, batchResult);
    }

    if (!quiet) {
      const icon =
        appResult.outcome === "SUBMITTED"
          ? "✓"
          : appResult.outcome === "VERIFICATION_REQUIRED"
            ? "⏳"
            : "✗";
      console.log(
        `[BATCH] ${icon} ${appResult.outcome} (${(durationMs / 1000).toFixed(1)}s)`,
      );
    }
  }

  return finalizeBatch(batchId, startedAt, results, rows.length, outputPath);
}

function finalizeBatch(
  batchId: string,
  startedAt: string,
  results: BatchRunResult[],
  totalJobs: number,
  outputPath: string,
): BatchSummary {
  const completedAt = new Date().toISOString();

  const submitted = results.filter((r) => r.outcome === "SUBMITTED").length;
  const verification = results.filter(
    (r) => r.outcome === "VERIFICATION_REQUIRED",
  ).length;
  const failed = results.filter((r) => r.outcome === "FAILED").length;
  const skipped = results.filter((r) => r.outcome === "SKIPPED").length;
  const successRate =
    totalJobs > 0
      ? `${Math.round(((submitted + verification) / totalJobs) * 100)}%`
      : "0%";

  const summary: BatchSummary = {
    batchId,
    startedAt,
    completedAt,
    totalJobs,
    submitted,
    verification,
    failed,
    skipped,
    successRate,
    results,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  return summary;
}
