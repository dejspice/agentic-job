/**
 * Targeted rerun of Wavelo and SmithRx rows from the Google Sheet
 * with real Anthropic-backed LLM fallback enabled.
 *
 * Usage:
 *   node --require tsx/cjs src/demo/rerun-wavelo-smithrx.ts
 *
 * Expects env vars:
 *   ANTHROPIC_API_KEY — Claude API key for LLM fallback
 *   GOOGLE_CREDENTIALS_JSON or GOOGLE_CREDENTIALS_PATH — Google API auth
 */

import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { readPendingRows } from "../connectors/sheet-reader.js";
import { convertResumeToPdf } from "../connectors/drive-converter.js";
import { writeRowResult } from "../connectors/sheet-writer.js";
import { runGreenhouseApplication } from "../harness/greenhouse-live-harness.js";
import type { ApplicationResult } from "../harness/greenhouse-live-harness.js";

const SPREADSHEET_ID = "1-uOsL9Z6F22lrHaPk30vU-7HmXh2Y9nP6iCNXlovb08";
const SHEET_NAME = "Job Tracking";
const ARTIFACT_DIR = resolve("./artifacts-batch");

const TARGET_COMPANIES = ["Wavelo", "SmithRx"];
const TARGET_ROWS = [97, 101];

interface RerunResult {
  rowIndex: number;
  company: string;
  jobTitle: string;
  jobUrl: string;
  outcome: string;
  durationMs: number;
  error?: string;
  statesCompleted?: string[];
  finalState?: string;
  llmFallbackEnabled: boolean;
  screeningAnswered?: unknown;
  screeningSkipped?: unknown;
  screeningFailed?: unknown;
}

async function main(): Promise<void> {
  console.log("\n=== Wavelo & SmithRx Targeted Rerun ===\n");

  // 1. Confirm Anthropic LLM fallback
  const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
  if (anthropicKey) {
    console.log("[rerun] LLM fallback : ENABLED (ANTHROPIC_API_KEY present)");
  } else {
    console.log("[rerun] LLM fallback : DISABLED (no ANTHROPIC_API_KEY)");
    console.log("[rerun] WARNING: Running without LLM fallback — freeform questions will be skipped.");
  }

  // 2. Read target rows from Google Sheet
  console.log(`[rerun] Reading Google Sheet (${SPREADSHEET_ID})…`);
  const allRows = await readPendingRows({ spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME });
  const targetRows = allRows.filter(
    (r) => TARGET_ROWS.includes(r.rowIndex) && TARGET_COMPANIES.includes(r.company),
  );

  if (targetRows.length === 0) {
    console.log("[rerun] No matching rows found. They may have been already processed.");
    console.log("[rerun] Looking for any Wavelo/SmithRx pending rows…");
    const fallbackRows = allRows.filter((r) => TARGET_COMPANIES.includes(r.company));
    if (fallbackRows.length === 0) {
      console.log("[rerun] No Wavelo/SmithRx rows remain pending. Exiting.");
      return;
    }
    console.log(`[rerun] Found ${fallbackRows.length} Wavelo/SmithRx rows. Using first two.`);
    targetRows.push(...fallbackRows.slice(0, 2));
  }

  console.log(`[rerun] Target rows: ${targetRows.length}`);
  for (const r of targetRows) {
    console.log(`[rerun]   Row ${r.rowIndex}: ${r.company} — ${r.jobTitle}`);
    console.log(`[rerun]     URL: ${r.jobUrl}`);
    console.log(`[rerun]     Resume: ${r.resumeLink}`);
  }

  // 3. Execute each row
  const results: RerunResult[] = [];

  for (const row of targetRows) {
    console.log(`\n[rerun] ─── Running: ${row.company} — ${row.jobTitle} ───`);

    const start = Date.now();

    // 3a. Export resume
    let resumePath: string;
    try {
      console.log(`[rerun]   Exporting resume from Google Drive…`);
      resumePath = await convertResumeToPdf(row.resumeLink, {
        outputDir: resolve(ARTIFACT_DIR, "resumes"),
        filename: `${row.firstName}-${row.lastName}-resume-row${row.rowIndex}`,
      });
      console.log(`[rerun]   Resume exported: ${resumePath}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[rerun]   Resume export FAILED: ${errMsg}`);
      results.push({
        rowIndex: row.rowIndex,
        company: row.company,
        jobTitle: row.jobTitle,
        jobUrl: row.jobUrl,
        outcome: "FAILED",
        durationMs: Date.now() - start,
        error: `Resume export failed: ${errMsg}`,
        llmFallbackEnabled: !!anthropicKey,
      });
      continue;
    }

    // 3b. Run application
    let appResult: ApplicationResult;
    try {
      console.log(`[rerun]   Executing Greenhouse apply flow…`);
      appResult = await runGreenhouseApplication(
        {
          jobUrl: row.jobUrl,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          resumePath,
        },
        {
          artifactDir: ARTIFACT_DIR,
          quiet: false,
        },
      );
    } catch (err) {
      appResult = {
        outcome: "FAILED",
        runId: "error",
        verificationRequired: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const durationMs = Date.now() - start;
    const icon = appResult.outcome === "SUBMITTED" ? "✓"
      : appResult.outcome === "VERIFICATION_REQUIRED" ? "⏳"
      : "✗";

    console.log(`[rerun]   ${icon} ${appResult.outcome} (${(durationMs / 1000).toFixed(1)}s)`);
    if (appResult.error) console.log(`[rerun]   Error: ${appResult.error}`);
    if (appResult.statesCompleted) {
      console.log(`[rerun]   States completed: ${appResult.statesCompleted.join(" → ")}`);
    }
    if (appResult.finalState) {
      console.log(`[rerun]   Final state: ${appResult.finalState}`);
    }

    results.push({
      rowIndex: row.rowIndex,
      company: row.company,
      jobTitle: row.jobTitle,
      jobUrl: row.jobUrl,
      outcome: appResult.outcome,
      durationMs,
      error: appResult.error,
      statesCompleted: appResult.statesCompleted,
      finalState: appResult.finalState,
      llmFallbackEnabled: !!anthropicKey,
    });

    // 3c. Write result back to sheet
    try {
      const statusMap: Record<string, "Applied" | "Failed" | "Skipped" | "Verification Required"> = {
        SUBMITTED: "Applied",
        VERIFICATION_REQUIRED: "Verification Required",
        FAILED: "Failed",
      };
      await writeRowResult(
        { spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME },
        {
          rowIndex: row.rowIndex,
          status: statusMap[appResult.outcome] ?? "Failed",
          runId: appResult.runId,
          outcome: appResult.outcome,
          error: appResult.error,
          completedAt: new Date().toISOString(),
        },
      );
      console.log(`[rerun]   Sheet writeback: OK (row ${row.rowIndex})`);
    } catch (err) {
      console.log(`[rerun]   Sheet writeback: FAILED (non-fatal) — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Summary
  console.log("\n=== Rerun Summary ===\n");
  console.log(`LLM fallback: ${anthropicKey ? "ENABLED" : "DISABLED"}`);
  console.log(`Total runs: ${results.length}`);
  console.log(`Submitted: ${results.filter(r => r.outcome === "SUBMITTED").length}`);
  console.log(`Verification: ${results.filter(r => r.outcome === "VERIFICATION_REQUIRED").length}`);
  console.log(`Failed: ${results.filter(r => r.outcome === "FAILED").length}`);
  console.log();

  for (const r of results) {
    console.log(`  Row ${r.rowIndex} (${r.company}): ${r.outcome}`);
    if (r.statesCompleted) {
      console.log(`    States: ${r.statesCompleted.join(" → ")}`);
    }
    if (r.finalState) console.log(`    Final state: ${r.finalState}`);
    if (r.error) console.log(`    Error: ${r.error}`);
  }

  // 5. Save results
  const outputPath = resolve(ARTIFACT_DIR, "rerun-wavelo-smithrx-results.json");
  mkdirSync(resolve(ARTIFACT_DIR), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved: ${outputPath}`);
}

main().catch((err: unknown) => {
  console.error("[rerun] Fatal error:", err);
  process.exit(1);
});
