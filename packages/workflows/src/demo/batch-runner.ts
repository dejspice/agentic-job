/**
 * Batch Runner — executes multiple Greenhouse applications sequentially.
 *
 * Reads rows from the sheet reader and runs each through the full
 * Greenhouse apply flow via runGreenhouseApplication.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApplicationRow } from "./sheet-reader.js";
import { runGreenhouseApplication } from "../harness/greenhouse-live-harness.js";
import type { ApplicationResult } from "../harness/greenhouse-live-harness.js";

export interface BatchRunResult {
  runId: string;
  jobUrl: string;
  candidate: string;
  outcome: "SUBMITTED" | "VERIFICATION_REQUIRED" | "FAILED";
  durationMs: number;
  verificationRequired: boolean;
  error?: string;
}

export interface BatchSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  totalJobs: number;
  submitted: number;
  verification: number;
  failed: number;
  successRate: string;
  results: BatchRunResult[];
}

/**
 * Run a batch of Greenhouse applications sequentially.
 *
 * For each row, executes the full apply flow and captures the result.
 * Writes results to the specified output file.
 */
export async function runBatch(
  rows: ApplicationRow[],
  options?: {
    artifactDir?: string;
    outputPath?: string;
    quiet?: boolean;
    onProgress?: (completed: number, total: number, result: BatchRunResult) => void;
  },
): Promise<BatchSummary> {
  const batchId = randomUUID().slice(0, 8);
  const artifactDir = resolve(options?.artifactDir ?? "./artifacts-batch");
  const outputPath = resolve(
    options?.outputPath ?? "./artifacts-batch/run-results.json",
  );
  const quiet = options?.quiet ?? false;

  const results: BatchRunResult[] = [];
  const startedAt = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const candidateName = `${row.firstName} ${row.lastName}`;

    if (!quiet) {
      console.log(
        `\n[BATCH] [${ i + 1}/${rows.length}] ${candidateName} → ${row.jobUrl}`,
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

  const completedAt = new Date().toISOString();

  const submitted = results.filter((r) => r.outcome === "SUBMITTED").length;
  const verification = results.filter(
    (r) => r.outcome === "VERIFICATION_REQUIRED",
  ).length;
  const failed = results.filter((r) => r.outcome === "FAILED").length;
  const successRate =
    rows.length > 0
      ? `${Math.round(((submitted + verification) / rows.length) * 100)}%`
      : "0%";

  const summary: BatchSummary = {
    batchId,
    startedAt,
    completedAt,
    totalJobs: rows.length,
    submitted,
    verification,
    failed,
    successRate,
    results,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  return summary;
}
