/**
 * Demo CLI — runs the full batch pipeline and prints a clean summary.
 *
 * Usage:
 *   node --require tsx/cjs src/demo/run-demo.ts
 *   node --require tsx/cjs src/demo/run-demo.ts path/to/input.json
 */

import { resolve } from "node:path";
import { readApplicationSheet } from "./sheet-reader.js";
import { runBatch } from "./batch-runner.js";
import type { BatchRunResult, BatchSummary } from "./batch-runner.js";

const DIVIDER = "─".repeat(45);

function printHeader(total: number): void {
  console.log();
  console.log(`[DEMO] ${DIVIDER}`);
  console.log(`[DEMO]  Greenhouse Apply — Batch Demo`);
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
        ? "⏳"
        : "✗";
  const duration = (result.durationMs / 1000).toFixed(1);

  console.log(
    `[DEMO]  ${icon} [${completed}/${total}] ${result.candidate} — ${result.outcome} (${duration}s)`,
  );
}

function printSummary(summary: BatchSummary): void {
  console.log();
  console.log(`[DEMO] ${DIVIDER}`);
  console.log(`[DEMO]  Total jobs:    ${summary.totalJobs}`);
  console.log(`[DEMO]  Submitted:     ${summary.submitted}`);
  console.log(`[DEMO]  Verification:  ${summary.verification}`);
  console.log(`[DEMO]  Failed:        ${summary.failed}`);
  console.log(`[DEMO]  Success rate:  ${summary.successRate}`);
  console.log(`[DEMO] ${DIVIDER}`);
  console.log(`[DEMO]  Results saved: artifacts-batch/run-results.json`);
  console.log(`[DEMO] ${DIVIDER}`);
  console.log();
}

async function main(): Promise<void> {
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

  printHeader(rows.length);

  const summary = await runBatch(rows, {
    artifactDir: resolve("./artifacts-batch"),
    outputPath: resolve("./artifacts-batch/run-results.json"),
    quiet: true,
    onProgress: printProgress,
  });

  printSummary(summary);
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
