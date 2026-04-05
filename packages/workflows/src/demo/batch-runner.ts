import * as fs from "node:fs";
import { getPendingApplications } from "../connectors/sheet-reader.js";
import { downloadResumeAsPDF } from "../connectors/drive-converter.js";
import { updateApplicationStatus } from "../connectors/sheet-writer.js";
import { runGreenhouseApplication } from "../harness/greenhouse-live-harness.js";

export interface BatchResult {
  jobUrl: string;
  company: string;
  title: string;
  ats: string;
  outcome: string;
  matchScore: number;
  duration: number;
  verificationRequired: boolean;
  runId: string;
  error?: string;
}

export interface CandidateInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/**
 * Orchestrates a full batch run:
 *   1. Reads pending Greenhouse rows from the tracking sheet
 *   2. Converts each row's Drive doc link to a local PDF
 *   3. Fires the Greenhouse accelerator
 *   4. Writes the outcome back to the sheet
 *
 * Returns a structured result array for the demo CLI summary.
 */
export async function runBatch(
  spreadsheetId: string,
  candidate: CandidateInfo,
): Promise<BatchResult[]> {
  const pending = await getPendingApplications(spreadsheetId);
  const results: BatchResult[] = [];

  console.log(
    `[BATCH] Found ${pending.length} pending Greenhouse applications`,
  );

  if (pending.length === 0) {
    console.log("[BATCH] Nothing to process — exiting.");
    return results;
  }

  const resumeDir = "./artifacts-batch/resumes";
  fs.mkdirSync(resumeDir, { recursive: true });

  for (const application of pending) {
    const start = Date.now();
    console.log(
      `\n[BATCH] ── ${application.company} — ${application.title} ──`,
    );
    console.log(`[BATCH] URL: ${application.jobUrl}`);
    console.log(`[BATCH] Score: ${application.matchScore}`);

    try {
      console.log("[BATCH] Converting Drive doc to PDF…");
      const resumePath = await downloadResumeAsPDF(
        application.docLink,
        resumeDir,
      );
      console.log(`[BATCH] Resume saved: ${resumePath}`);

      console.log("[BATCH] Launching Greenhouse accelerator…");
      const result = await runGreenhouseApplication({
        jobUrl: application.jobUrl,
        resumePath,
        ...candidate,
      });

      const status =
        result.outcome === "SUBMITTED"
          ? ("submitted" as const)
          : result.outcome === "VERIFICATION_REQUIRED"
            ? ("verification_required" as const)
            : ("failed" as const);

      await updateApplicationStatus(
        spreadsheetId,
        application.rowIndex,
        status,
        { confirmationUrl: result.confirmationUrl, runId: result.runId },
      );

      console.log(`[BATCH] Outcome: ${result.outcome}`);

      results.push({
        jobUrl: application.jobUrl,
        company: application.company,
        title: application.title,
        ats: application.ats,
        outcome: result.outcome,
        matchScore: application.matchScore,
        duration: Date.now() - start,
        verificationRequired: result.verificationRequired,
        runId: result.runId,
      });
    } catch (error) {
      console.error(
        `[BATCH] Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      await updateApplicationStatus(
        spreadsheetId,
        application.rowIndex,
        "failed",
      ).catch((e) =>
        console.warn(`[BATCH] Writeback failed: ${String(e)}`),
      );

      results.push({
        jobUrl: application.jobUrl,
        company: application.company,
        title: application.title,
        ats: application.ats,
        outcome: "FAILED",
        matchScore: application.matchScore,
        duration: Date.now() - start,
        verificationRequired: false,
        runId: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const resultsDir = "./artifacts-batch";
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    `${resultsDir}/run-results.json`,
    JSON.stringify(results, null, 2),
  );

  return results;
}
