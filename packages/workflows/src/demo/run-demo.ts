import { runBatch } from "./batch-runner.js";

async function main(): Promise<void> {
  const SPREADSHEET_ID = process.env["GOOGLE_SHEET_ID"];
  if (!SPREADSHEET_ID) {
    console.error("[DEMO] GOOGLE_SHEET_ID environment variable is required.");
    process.exit(1);
  }

  const firstName = process.env["CANDIDATE_FIRST_NAME"];
  const lastName = process.env["CANDIDATE_LAST_NAME"];
  const email = process.env["CANDIDATE_EMAIL"];
  if (!firstName || !lastName || !email) {
    console.error(
      "[DEMO] Missing required env: CANDIDATE_FIRST_NAME, CANDIDATE_LAST_NAME, CANDIDATE_EMAIL",
    );
    process.exit(1);
  }

  const candidate = {
    firstName,
    lastName,
    email,
    phone: process.env["CANDIDATE_PHONE"],
  };

  console.log("[DEMO] ─────────────────────────────");
  console.log("[DEMO] Starting application batch…");
  console.log(`[DEMO] Sheet: ${SPREADSHEET_ID}`);
  console.log(`[DEMO] Candidate: ${firstName} ${lastName} <${email}>`);
  console.log("[DEMO] ─────────────────────────────\n");

  const results = await runBatch(SPREADSHEET_ID, candidate);

  if (results.length === 0) {
    console.log("[DEMO] No pending Greenhouse applications found.");
    console.log("[DEMO] ─────────────────────────────");
    return;
  }

  const submitted = results.filter((r) => r.outcome === "SUBMITTED").length;
  const verification = results.filter(
    (r) => r.outcome === "VERIFICATION_REQUIRED",
  ).length;
  const failed = results.filter((r) => r.outcome === "FAILED").length;
  const successRate =
    results.length > 0
      ? Math.round((submitted / results.length) * 100)
      : 0;

  console.log("\n[DEMO] ─────────────────────────────");
  console.log(`[DEMO] Total jobs:     ${results.length}`);
  console.log(`[DEMO] Submitted:      ${submitted}`);
  console.log(`[DEMO] Verification:   ${verification}`);
  console.log(`[DEMO] Failed:         ${failed}`);
  console.log(`[DEMO] Success rate:   ${successRate}%`);
  console.log("[DEMO] ─────────────────────────────\n");

  for (const r of results) {
    const icon =
      r.outcome === "SUBMITTED"
        ? "\u2713"
        : r.outcome === "VERIFICATION_REQUIRED"
          ? "\u26A0"
          : "\u2717";
    const duration = `${(r.duration / 1000).toFixed(1)}s`;
    console.log(
      `[DEMO] ${icon} ${r.company} — ${r.title} (score: ${r.matchScore}, ${duration})`,
    );
  }

  console.log("\n[DEMO] ─────────────────────────────");
  console.log("[DEMO] Results saved to artifacts-batch/run-results.json");
  console.log("[DEMO] Sheet updated.");
  console.log("[DEMO] ─────────────────────────────");
}

main().catch((err: unknown) => {
  console.error("[DEMO] Fatal error:", err);
  process.exit(1);
});
