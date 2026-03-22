/**
 * Greenhouse Live-Target Execution Harness
 *
 * Runs the hardened Greenhouse happy-path state machine against a real,
 * configurable target URL using a broker-allocated browser session.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   # Minimum — run against a live Greenhouse job URL using local Chromium:
 *   GREENHOUSE_TARGET_URL="https://boards.greenhouse.io/acme/jobs/12345" \
 *   GREENHOUSE_RESUME_PATH="/path/to/resume.pdf" \
 *   GREENHOUSE_FIRST_NAME="Jane" \
 *   GREENHOUSE_LAST_NAME="Doe" \
 *   GREENHOUSE_EMAIL="jane@example.com" \
 *   node --require tsx/cjs packages/workflows/src/harness/greenhouse-live-harness.ts
 *
 *   # Or via package script (from packages/workflows/):
 *   npm run harness:greenhouse-live
 *
 *   # Use Bright Data as the browser provider:
 *   BROWSER_PROVIDER=bright_data \
 *   BRIGHT_DATA_AUTH="your-auth-token" \
 *   GREENHOUSE_TARGET_URL="..." \
 *   npm run harness:greenhouse-live
 *
 *   # Open a visible browser window (local provider only):
 *   BROWSER_HEADLESS=false \
 *   GREENHOUSE_TARGET_URL="..." \
 *   npm run harness:greenhouse-live
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Required environment variables
 * ─────────────────────────────────────────────────────────────────────────────
 *   GREENHOUSE_TARGET_URL     — Greenhouse job posting URL (boards.greenhouse.io/…)
 *   GREENHOUSE_RESUME_PATH    — Absolute path to a resume file to upload
 *   GREENHOUSE_FIRST_NAME     — Candidate first name
 *   GREENHOUSE_LAST_NAME      — Candidate last name
 *   GREENHOUSE_EMAIL          — Candidate email address
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Optional environment variables
 * ─────────────────────────────────────────────────────────────────────────────
 *   GREENHOUSE_PHONE          — Candidate phone number (optional on most boards)
 *   BROWSER_PROVIDER          — "local" (default) | "bright_data" | "browserbase"
 *   BROWSER_HEADLESS          — "false" to open a visible browser (local only)
 *   GREENHOUSE_ARTIFACT_DIR   — Directory for artifact output (default: ./artifacts-live)
 *   GREENHOUSE_RUN_ID         — Override the generated run ID
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider-specific environment variables
 * ─────────────────────────────────────────────────────────────────────────────
 *   BRIGHT_DATA_AUTH          — Required when BROWSER_PROVIDER=bright_data
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Skip behaviour
 * ─────────────────────────────────────────────────────────────────────────────
 * When GREENHOUSE_TARGET_URL is absent or empty, the harness prints a skip
 * message and exits 0 cleanly.  This makes it safe to include in CI pipelines
 * where live credentials may not be available.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Artifacts
 * ─────────────────────────────────────────────────────────────────────────────
 * Screenshots, DOM snapshots, and the confirmation screenshot are written to:
 *   <GREENHOUSE_ARTIFACT_DIR>/<runId>/<kind>/<label>.<ext>
 *
 * The harness prints the exact artifact directory path at the end of the run
 * so you can inspect the screenshots immediately.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { BrowserBroker, RuntimeProvider } from "@dejsol/browser-broker";
import type { SessionRequirements, AllocatedSession } from "@dejsol/browser-broker";
import { LocalFileArtifactStore } from "@dejsol/browser-worker";
import { createAnswerGenerator, createClaudeProvider } from "@dejsol/intelligence";
import { executeGreenhouseHappyPath } from "../activities/greenhouse-browser-activity.js";

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface HarnessConfig {
  /** Greenhouse job posting URL to run against. */
  targetUrl: string;
  /** Absolute path to the resume file to upload. */
  resumePath: string;
  /** Candidate profile fields. */
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    country?: string;
    location?: string;
    linkedin?: string;
    requireSponsorship?: string;
    authorizedToWork?: string;
    previouslyWorkedAsRole?: string;
    experienceDuration?: string;
    industry?: string;
    analyticsScope?: string;
    pythonExperience?: string;
    hasPortfolio?: string;
    workedHereBefore?: string;
    salaryRange?: string;
    state?: string;
    industryExperience?: string;
  };
  /** Browser provider to use for session allocation. */
  provider: RuntimeProvider;
  /** When false, open a visible browser window (local provider only). */
  headless: boolean;
  /** Root directory for artifact output. Defaults to ./artifacts-live. */
  artifactDir: string;
  /** Run identifier for trace correlation. */
  runId: string;
  /** Playwright slowMo in ms — adds delay to every browser action. 0 = off. */
  slowMo: number;
  /** Milliseconds to pause before clicking the submit button. */
  preSubmitDwellMs: number;
}

// ---------------------------------------------------------------------------
// Configuration loader
// ---------------------------------------------------------------------------

/**
 * Read harness configuration from environment variables.
 *
 * Returns `null` if GREENHOUSE_TARGET_URL is absent or empty — the harness
 * should skip cleanly in that case.
 *
 * Throws with a descriptive message when required variables are present but
 * other required fields are missing.
 */
export function loadHarnessConfig(): HarnessConfig | null {
  const targetUrl = process.env["GREENHOUSE_TARGET_URL"]?.trim();

  if (!targetUrl) {
    return null; // Clean skip — env not configured
  }

  const missingFields: string[] = [];

  const resumePath = process.env["GREENHOUSE_RESUME_PATH"]?.trim();
  if (!resumePath) missingFields.push("GREENHOUSE_RESUME_PATH");

  const firstName = process.env["GREENHOUSE_FIRST_NAME"]?.trim();
  if (!firstName) missingFields.push("GREENHOUSE_FIRST_NAME");

  const lastName = process.env["GREENHOUSE_LAST_NAME"]?.trim();
  if (!lastName) missingFields.push("GREENHOUSE_LAST_NAME");

  const email = process.env["GREENHOUSE_EMAIL"]?.trim();
  if (!email) missingFields.push("GREENHOUSE_EMAIL");

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required environment variables for Greenhouse live harness:\n` +
        missingFields.map((f) => `  ${f}`).join("\n"),
    );
  }

  const providerRaw = (process.env["BROWSER_PROVIDER"] ?? "local").toLowerCase().trim();
  const providerMap: Record<string, RuntimeProvider> = {
    local: RuntimeProvider.LOCAL,
    bright_data: RuntimeProvider.BRIGHT_DATA,
    browserbase: RuntimeProvider.BROWSERBASE,
  };
  const provider = providerMap[providerRaw];
  if (!provider) {
    throw new Error(
      `Unknown BROWSER_PROVIDER "${providerRaw}". ` +
        `Valid values: ${Object.keys(providerMap).join(", ")}`,
    );
  }

  return {
    targetUrl: targetUrl!,
    resumePath: resolve(resumePath!),
    candidate: {
      firstName: firstName!,
      lastName: lastName!,
      email: email!,
      phone: process.env["GREENHOUSE_PHONE"]?.trim() || undefined,
      country: process.env["GREENHOUSE_COUNTRY"]?.trim() || "United States",
      location: process.env["GREENHOUSE_LOCATION"]?.trim() || "Arlington",
      linkedin: process.env["GREENHOUSE_LINKEDIN"]?.trim() || "N/A",
      requireSponsorship: "No",
      authorizedToWork: "Yes",
      previouslyWorkedAsRole: "Yes",
      experienceDuration: "5+ years",
      industry: "SaaS / Software",
      analyticsScope: "Defining KPIs and building analytics frameworks",
      pythonExperience: "I use Python or R regularly for data analysis",
      hasPortfolio: "Yes",
      workedHereBefore: "No",
      salaryRange: "$120,000 - $140,000",
      state: process.env["GREENHOUSE_STATE"]?.trim() || "Texas",
      industryExperience: "Yes, 8 years in SaaS and fintech.",
    },
    provider,
    headless: process.env["BROWSER_HEADLESS"]?.toLowerCase() !== "false",
    artifactDir: resolve(
      process.env["GREENHOUSE_ARTIFACT_DIR"]?.trim() || "./artifacts-live",
    ),
    runId: process.env["GREENHOUSE_RUN_ID"]?.trim() || randomUUID(),
    slowMo: parseInt(process.env["BROWSER_SLOW_MO_MS"] ?? "100", 10),
    preSubmitDwellMs: parseInt(process.env["PRE_SUBMIT_DWELL_MS"] ?? "2000", 10),
  };
}

// ---------------------------------------------------------------------------
// Harness execution
// ---------------------------------------------------------------------------

/**
 * Execute the live Greenhouse harness with the given configuration.
 *
 * Allocates a broker session, runs executeGreenhouseHappyPath, persists
 * artifacts to disk, then releases the session.
 *
 * Returns true on success, false on failure.
 */
export async function runLiveHarness(config: HarnessConfig): Promise<boolean> {
  const { targetUrl, resumePath, candidate, provider, headless, artifactDir, runId, slowMo, preSubmitDwellMs } = config;

  console.log("\n[greenhouse-live] ─────────────────────────────────");
  console.log(`[greenhouse-live] Run ID    : ${runId}`);
  console.log(`[greenhouse-live] Target URL: ${targetUrl}`);
  console.log(`[greenhouse-live] Provider  : ${provider}`);
  console.log(`[greenhouse-live] Headless  : ${headless}`);
  console.log(`[greenhouse-live] Slow-mo   : ${slowMo}ms`);
  console.log(`[greenhouse-live] Pre-submit: ${preSubmitDwellMs}ms`);
  console.log(`[greenhouse-live] Artifact  : ${artifactDir}/${runId}/`);
  console.log("[greenhouse-live] ─────────────────────────────────\n");

  const broker = new BrowserBroker();
  const requirements: SessionRequirements = { provider, headless, slowMo };
  let session: AllocatedSession | undefined;

  try {
    console.log(`[greenhouse-live] Allocating ${provider} browser session…`);
    session = await broker.allocateSession(requirements);
    console.log(`[greenhouse-live] Session allocated: ${session.id}`);

    const store = new LocalFileArtifactStore(artifactDir);

    const candidateBag: Record<string, string> = {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
    };
    for (const [k, v] of Object.entries(candidate)) {
      if (v && !candidateBag[k]) candidateBag[k] = v;
    }

    // Extract company name from URL for job context (e.g. "nmi" from
    // "job-boards.greenhouse.io/nmi/jobs/123")
    const urlCompany = targetUrl.match(/greenhouse\.io\/([^/]+)/)?.[1] ?? undefined;

    // Create answer generator with Claude fallback if API key is present
    const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
    const answerGenerator = anthropicKey
      ? createAnswerGenerator(createClaudeProvider(anthropicKey))
      : createAnswerGenerator(); // deterministic-only, no model

    if (anthropicKey) {
      console.log("[greenhouse-live] LLM fallback : enabled (Claude)");
    } else {
      console.log("[greenhouse-live] LLM fallback : disabled (no ANTHROPIC_API_KEY)");
    }

    const data: Record<string, unknown> = {
      resumeFile: resumePath,
      candidate: candidateBag,
      preSubmitDwellMs,
      answerGenerator,
      company: urlCompany,
      jobTitle: undefined,
    };

    console.log("[greenhouse-live] Starting state-machine execution…\n");
    const start = Date.now();

    const result = await executeGreenhouseHappyPath({
      page: session.page,
      store,
      runId,
      jobId: `live-job-${runId.slice(0, 8)}`,
      candidateId: `live-cand-${runId.slice(0, 8)}`,
      jobUrl: targetUrl,
      data,
    });

    const durationMs = Date.now() - start;

    // ── Print result ──────────────────────────────────────────────────────

    const verificationRequired = Boolean(result.data?.verificationRequired);
    const displayOutcome = verificationRequired
      ? "VERIFICATION_REQUIRED"
      : result.outcome.toUpperCase();

    console.log("\n[greenhouse-live] ─────────────────────────────────");
    console.log(`[greenhouse-live] Outcome       : ${displayOutcome}`);
    if (verificationRequired) {
      console.log("[greenhouse-live] ⚠️  Greenhouse sent a verification code to your email.");
      console.log("[greenhouse-live]    The application is submitted — enter the code to finalize.");
    }
    console.log(`[greenhouse-live] Final state   : ${result.finalState}`);
    console.log(`[greenhouse-live] States done   : ${result.statesCompleted.length} / 12`);
    console.log(`[greenhouse-live] Duration      : ${(durationMs / 1000).toFixed(1)}s`);

    if (result.confirmationId) {
      console.log(`[greenhouse-live] Confirmation  : ${result.confirmationId}`);
    }
    if (result.error) {
      console.log(`[greenhouse-live] Error         : ${result.error}`);
    }

    console.log(`[greenhouse-live] Artifacts     : ${result.artifacts.length} captured`);
    if (result.artifacts.length > 0) {
      console.log(`[greenhouse-live] Artifact dir  : ${artifactDir}/${runId}/`);
      for (const ref of result.artifacts) {
        console.log(`[greenhouse-live]   [${ref.kind}] ${ref.label} → ${ref.url}`);
      }
    }

    console.log(`[greenhouse-live] States completed:`);
    for (const s of result.statesCompleted) {
      console.log(`[greenhouse-live]   ✓ ${s}`);
    }
    if (result.finalState && !result.statesCompleted.includes(result.finalState)) {
      console.log(`[greenhouse-live]   ✗ ${result.finalState} (failed here)`);
    }

    console.log("[greenhouse-live] ─────────────────────────────────\n");

    // VERIFICATION_REQUIRED is a success — the form was submitted.
    return result.outcome === "success" || verificationRequired;
  } finally {
    if (session) {
      try {
        await broker.releaseSession(session);
        console.log("[greenhouse-live] Browser session released.");
      } catch (releaseErr) {
        console.warn("[greenhouse-live] Failed to release session:", releaseErr);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main — auto-executes when this file is the entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let config: HarnessConfig | null;

  try {
    config = loadHarnessConfig();
  } catch (err) {
    console.error(`[greenhouse-live] Configuration error: ${(err as Error).message}`);
    process.exit(1);
  }

  if (config === null) {
    console.log(
      "[greenhouse-live] GREENHOUSE_TARGET_URL is not set — skipping live-target run.\n" +
        "[greenhouse-live] Set GREENHOUSE_TARGET_URL (and other required env vars)\n" +
        "[greenhouse-live] to execute against a real Greenhouse job page.",
    );
    process.exit(0);
  }

  const success = await runLiveHarness(config);
  process.exit(success ? 0 : 1);
}

// Auto-execute only when this file is invoked directly as the Node entry point.
// Uses process.argv[1] rather than require.main === module because the latter
// is unreliable across tsx/cjs contexts and Node --test mode.
// When the test runner imports this module, argv[1] is the test file path and
// the condition is false — main() is not called and no side effects occur.
const _scriptPath = process.argv[1] ?? "";
if (
  _scriptPath.endsWith("greenhouse-live-harness.ts") ||
  _scriptPath.endsWith("greenhouse-live-harness.js")
) {
  main().catch((err: unknown) => {
    console.error("[greenhouse-live] Fatal error:", err);
    process.exit(1);
  });
}
