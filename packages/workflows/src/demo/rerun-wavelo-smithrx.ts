/**
 * Targeted rerun of Wavelo and SmithRx rows from the Google Sheet
 * with real Anthropic-backed LLM fallback enabled.
 *
 * Uses the structured candidate profile from candidate.json.
 *
 * Usage:
 *   node --require tsx/cjs src/demo/rerun-wavelo-smithrx.ts
 */

import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { resolveGoogleCredentials } from "../connectors/google-auth.js";
import { convertResumeToPdf } from "../connectors/drive-converter.js";
import { writeRowResult } from "../connectors/sheet-writer.js";
import { runGreenhouseApplication } from "../harness/greenhouse-live-harness.js";
import type { ApplicationResult } from "../harness/greenhouse-live-harness.js";
import { loadCandidateProfile } from "./load-candidate.js";

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
}

async function main(): Promise<void> {
  console.log("\n=== Wavelo & SmithRx Targeted Rerun ===\n");

  const candidate = loadCandidateProfile();
  console.log(`[rerun] Candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);
  console.log(`[rerun] Phone: ${candidate.phone} | City: ${candidate.city} | State: ${candidate.state}`);

  const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
  console.log(`[rerun] LLM fallback : ${anthropicKey ? "ENABLED" : "DISABLED"}`);

  console.log(`[rerun] Reading Google Sheet (${SPREADSHEET_ID})…`);
  const creds = resolveGoogleCredentials();
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    ...(creds.keyFile ? { keyFile: creds.keyFile } : {}),
    ...(creds.credentials ? { credentials: creds.credentials } : {}),
  });
  const sheets = google.sheets({ version: "v4", auth });
  const range = `'${SHEET_NAME}'!A2:M`;
  const sheetRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rawRows = (sheetRes.data.values ?? []) as string[][];

  interface TargetRow {
    rowIndex: number;
    company: string;
    jobTitle: string;
    jobUrl: string;
    resumeLink: string;
  }
  const targetRows: TargetRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowIndex = i + 2;
    const company = String(row[2] ?? "").trim();
    const jobUrl = String(row[6] ?? "").trim();
    const resumeLink = String(row[7] ?? "").trim();
    if (TARGET_ROWS.includes(rowIndex) && TARGET_COMPANIES.includes(company) && jobUrl) {
      targetRows.push({ rowIndex, company, jobTitle: String(row[1] ?? "").trim(), jobUrl, resumeLink });
    }
  }

  if (targetRows.length === 0) {
    console.log("[rerun] No matching rows found at expected positions. Exiting.");
    return;
  }

  console.log(`[rerun] Target rows: ${targetRows.length}`);
  for (const r of targetRows) {
    console.log(`[rerun]   Row ${r.rowIndex}: ${r.company} — ${r.jobTitle}`);
  }

  const results: RerunResult[] = [];

  for (const row of targetRows) {
    console.log(`\n[rerun] ─── Running: ${row.company} — ${row.jobTitle} ───`);
    const start = Date.now();

    let resumePath: string;
    try {
      console.log(`[rerun]   Exporting resume from Google Drive…`);
      resumePath = await convertResumeToPdf(row.resumeLink, {
        outputDir: resolve(ARTIFACT_DIR, "resumes"),
        filename: `${candidate.firstName}-${candidate.lastName}-resume-row${row.rowIndex}`,
      });
      console.log(`[rerun]   Resume exported: ${resumePath}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[rerun]   Resume export FAILED: ${errMsg}`);
      results.push({
        rowIndex: row.rowIndex, company: row.company, jobTitle: row.jobTitle,
        jobUrl: row.jobUrl, outcome: "FAILED", durationMs: Date.now() - start,
        error: `Resume export failed: ${errMsg}`, llmFallbackEnabled: !!anthropicKey,
      });
      continue;
    }

    let appResult: ApplicationResult;
    try {
      appResult = await runGreenhouseApplication(
        {
          jobUrl: row.jobUrl,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          resumePath,
          city: candidate.city,
          state: candidate.state,
          country: candidate.country,
          location: `${candidate.city}, ${candidate.state}`,
        },
        { artifactDir: ARTIFACT_DIR, quiet: false },
      );
    } catch (err) {
      appResult = {
        outcome: "FAILED", runId: "error", verificationRequired: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const durationMs = Date.now() - start;
    const icon = appResult.outcome === "SUBMITTED" ? "✓"
      : appResult.outcome === "VERIFICATION_REQUIRED" ? "⏳" : "✗";

    console.log(`[rerun]   ${icon} ${appResult.outcome} (${(durationMs / 1000).toFixed(1)}s)`);
    if (appResult.error) console.log(`[rerun]   Error: ${appResult.error}`);
    if (appResult.statesCompleted) console.log(`[rerun]   States: ${appResult.statesCompleted.join(" → ")}`);
    if (appResult.finalState) console.log(`[rerun]   Final state: ${appResult.finalState}`);

    results.push({
      rowIndex: row.rowIndex, company: row.company, jobTitle: row.jobTitle,
      jobUrl: row.jobUrl, outcome: appResult.outcome, durationMs,
      error: appResult.error, statesCompleted: appResult.statesCompleted,
      finalState: appResult.finalState, llmFallbackEnabled: !!anthropicKey,
    });

    try {
      const statusMap: Record<string, "Applied" | "Failed" | "Skipped" | "Verification Required"> = {
        SUBMITTED: "Applied", VERIFICATION_REQUIRED: "Verification Required", FAILED: "Failed",
      };
      await writeRowResult(
        { spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME },
        { rowIndex: row.rowIndex, status: statusMap[appResult.outcome] ?? "Failed",
          runId: appResult.runId, outcome: appResult.outcome, error: appResult.error,
          completedAt: new Date().toISOString() },
      );
      console.log(`[rerun]   Sheet writeback: OK`);
    } catch (err) {
      console.log(`[rerun]   Sheet writeback: FAILED (non-fatal)`);
    }
  }

  console.log("\n=== Rerun Summary ===\n");
  console.log(`Candidate: ${candidate.firstName} ${candidate.lastName} | Phone: ${candidate.phone}`);
  console.log(`LLM fallback: ${anthropicKey ? "ENABLED" : "DISABLED"}`);
  console.log(`Total: ${results.length} | Submitted: ${results.filter(r => r.outcome === "SUBMITTED").length} | Verification: ${results.filter(r => r.outcome === "VERIFICATION_REQUIRED").length} | Failed: ${results.filter(r => r.outcome === "FAILED").length}`);
  for (const r of results) {
    console.log(`\n  Row ${r.rowIndex} (${r.company}): ${r.outcome}`);
    if (r.statesCompleted) console.log(`    States: ${r.statesCompleted.join(" → ")}`);
    if (r.finalState) console.log(`    Final state: ${r.finalState}`);
    if (r.error) console.log(`    Error: ${r.error}`);
  }

  const outputPath = resolve(ARTIFACT_DIR, "rerun-wavelo-smithrx-results.json");
  mkdirSync(resolve(ARTIFACT_DIR), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved: ${outputPath}`);
}

main().catch((err: unknown) => {
  console.error("[rerun] Fatal error:", err);
  process.exit(1);
});
