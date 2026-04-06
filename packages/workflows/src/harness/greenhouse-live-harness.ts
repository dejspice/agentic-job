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
import { pollForVerificationCode } from "../connectors/gmail-poller.js";
import {
  executeGreenhouseHappyPath,
  enterVerificationCode,
} from "../activities/greenhouse-browser-activity.js";

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
    city?: string;
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
    gender?: string;
    raceEthnicity?: string;
    veteranStatus?: string;
    disabilityStatus?: string;
    hispanicLatino?: string;
    whyCompany?: string;
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
  /** Maximum run duration in ms before the harness aborts. Default 5 minutes. */
  maxRunMs: number;
  /** Milliseconds to wait for operator to enter a verification code. Default 15 minutes. */
  verificationCodeTimeoutMs: number;
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
      gender: "Cisgender man",
      raceEthnicity: "South Asian",
      veteranStatus: "I have never served in the military",
      disabilityStatus: "No, I do not have a disability and have not had one in the past",
      hispanicLatino: "No",
      whyCompany: process.env["GREENHOUSE_WHY_COMPANY"]?.trim() || undefined,
    },
    provider,
    headless: process.env["BROWSER_HEADLESS"]?.toLowerCase() !== "false",
    artifactDir: resolve(
      process.env["GREENHOUSE_ARTIFACT_DIR"]?.trim() || "./artifacts-live",
    ),
    runId: process.env["GREENHOUSE_RUN_ID"]?.trim() || randomUUID(),
    slowMo: parseInt(process.env["BROWSER_SLOW_MO_MS"] ?? "100", 10),
    preSubmitDwellMs: parseInt(process.env["PRE_SUBMIT_DWELL_MS"] ?? "2000", 10),
    maxRunMs: parseInt(process.env["MAX_RUN_MS"] ?? "300000", 10),
    verificationCodeTimeoutMs: parseInt(
      process.env["VERIFICATION_CODE_TIMEOUT_MS"] ?? "900000", 10, // 15 minutes default
    ),
  };
}

// ---------------------------------------------------------------------------
// Programmatic invocation — batch-friendly entry point
// ---------------------------------------------------------------------------

export interface ApplicationInput {
  jobUrl: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  resumePath: string;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
}

export interface ApplicationResult {
  outcome: "SUBMITTED" | "VERIFICATION_REQUIRED" | "FAILED";
  runId: string;
  verificationRequired: boolean;
  error?: string;
  finalState?: string;
  statesCompleted?: string[];
  artifactDir?: string;
}

/**
 * Run a single Greenhouse application programmatically.
 *
 * This is the batch-friendly entry point — no env vars needed.
 * Allocates a browser, executes the full happy path, releases the browser.
 */
export async function runGreenhouseApplication(
  input: ApplicationInput,
  options?: {
    artifactDir?: string;
    runId?: string;
    provider?: RuntimeProvider;
    headless?: boolean;
    quiet?: boolean;
  },
): Promise<ApplicationResult> {
  const runId = options?.runId ?? randomUUID();
  const artifactDir = resolve(options?.artifactDir ?? "./artifacts-batch");
  const provider = options?.provider ?? RuntimeProvider.LOCAL;
  const headless = options?.headless ?? true;
  const quiet = options?.quiet ?? false;

  const config: HarnessConfig = {
    targetUrl: input.jobUrl,
    resumePath: resolve(input.resumePath),
    candidate: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      city: input.city,
      country: input.country,
      location: input.location,
      state: input.state,
    },
    provider,
    headless,
    artifactDir,
    runId,
    slowMo: 0,
    preSubmitDwellMs: 0,
    maxRunMs: 300_000,
    verificationCodeTimeoutMs: 0,
  };

  const broker = new BrowserBroker();
  const requirements: SessionRequirements = { provider, headless, slowMo: 0 };
  let session: AllocatedSession | undefined;

  try {
    session = await broker.allocateSession(requirements);
    const store = new LocalFileArtifactStore(artifactDir);

    const candidateBag: Record<string, string> = {
      firstName: config.candidate.firstName,
      lastName: config.candidate.lastName,
      email: config.candidate.email,
    };
    for (const [k, v] of Object.entries(config.candidate)) {
      if (v && !candidateBag[k]) candidateBag[k] = v;
    }

    const urlCompany = input.jobUrl.match(/greenhouse\.io\/([^/]+)/)?.[1] ?? undefined;

    const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
    const answerGenerator = anthropicKey
      ? createAnswerGenerator(createClaudeProvider(anthropicKey))
      : createAnswerGenerator();

    const data: Record<string, unknown> = {
      resumeFile: config.resumePath,
      candidate: candidateBag,
      answerGenerator,
      company: urlCompany,
      jobTitle: undefined,
    };

    const result = await executeGreenhouseHappyPath({
      page: session.page,
      store,
      runId,
      jobId: `live-job-${runId.slice(0, 8)}`,
      candidateId: `live-cand-${runId.slice(0, 8)}`,
      jobUrl: input.jobUrl,
      data,
    });

    const verificationRequired =
      result.outcome === "success" &&
      (result.data?.verificationRequired === true ||
        result.finalState === "CAPTURE_CONFIRMATION" &&
          !result.confirmationId);

    let outcome: ApplicationResult["outcome"];
    if (result.outcome === "success") {
      outcome = verificationRequired ? "VERIFICATION_REQUIRED" : "SUBMITTED";
    } else {
      outcome = "FAILED";
    }

    // ── Auto-verify via Gmail polling ────────────────────────────────
    // If verification is required and Gmail credentials are configured,
    // poll for the code and enter it on the still-open page.
    if (verificationRequired && session?.page) {
      console.log("[APPLY] Verification code required — checking Gmail...");
      const code = await pollForVerificationCode({
        timeoutMs: 90_000,
        pollIntervalMs: 3_000,
        searchWindowMs: 120_000,
      });

      if (code) {
        console.log(`[APPLY] Verification code received — entering...`);
        const verifyResult = await enterVerificationCode(session.page, code);
        if (verifyResult.success) {
          console.log("[APPLY] Code accepted — application fully submitted");
          outcome = "SUBMITTED";
        } else {
          console.log(`[APPLY] Code entry failed: ${verifyResult.outcome}`);
        }
      }
    }

    return {
      outcome,
      runId,
      verificationRequired,
      finalState: String(result.finalState),
      statesCompleted: result.statesCompleted.map(String),
      artifactDir: `${artifactDir}/${runId}`,
      ...(result.error ? { error: result.error } : {}),
    };
  } catch (err) {
    return {
      outcome: "FAILED",
      runId,
      verificationRequired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (session) {
      try {
        await broker.releaseSession(session);
      } catch {
        // Swallow release errors
      }
    }
  }
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
  const {
    targetUrl, resumePath, candidate, provider, headless,
    artifactDir, runId, slowMo, preSubmitDwellMs, maxRunMs,
    verificationCodeTimeoutMs,
  } = config;

  console.log("\n[greenhouse-live] ─────────────────────────────────");
  console.log(`[greenhouse-live] Run ID    : ${runId}`);
  console.log(`[greenhouse-live] Target URL: ${targetUrl}`);
  console.log(`[greenhouse-live] Provider  : ${provider}`);
  console.log(`[greenhouse-live] Headless  : ${headless}`);
  console.log(`[greenhouse-live] Slow-mo   : ${slowMo}ms`);
  console.log(`[greenhouse-live] Pre-submit: ${preSubmitDwellMs}ms`);
  console.log(`[greenhouse-live] Max run   : ${(maxRunMs / 1000).toFixed(0)}s`);
  console.log(`[greenhouse-live] Code wait : ${(verificationCodeTimeoutMs / 60_000).toFixed(0)}m`);
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

    const runPromise = executeGreenhouseHappyPath({
      page: session.page,
      store,
      runId,
      jobId: `live-job-${runId.slice(0, 8)}`,
      candidateId: `live-cand-${runId.slice(0, 8)}`,
      jobUrl: targetUrl,
      data,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Run exceeded ${(maxRunMs / 1000).toFixed(0)}s timeout`)), maxRunMs),
    );

    const result = await Promise.race([runPromise, timeoutPromise]);

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

    // ── Verification code entry (live session is still open) ──────────────
    // The browser session is still active here.  If Greenhouse showed the
    // verification challenge, prompt the operator for the code NOW — before
    // the session is released — so we can enter it in the same page context.
    if (verificationRequired && session?.page) {
      const waitMin = (verificationCodeTimeoutMs / 60_000).toFixed(0);
      console.log("[greenhouse-live] 🔑 Verification code required.");
      console.log("[greenhouse-live]    Check your email inbox for the code.");
      console.log(`[greenhouse-live]    Waiting up to ${waitMin} minute(s) for code entry.`);
      const code = await promptForVerificationCode(verificationCodeTimeoutMs);
      if (code) {
        console.log("[greenhouse-live] Entering verification code…");
        const verifyResult = await enterVerificationCode(session.page, code);
        if (verifyResult.success) {
          console.log("[greenhouse-live] ✓ Code accepted — application submitted!");
        } else {
          console.log(
            `[greenhouse-live] ✗ Code entry: ${verifyResult.outcome}` +
            (verifyResult.error ? ` (${verifyResult.error})` : ""),
          );
          console.log("[greenhouse-live]   Complete entry manually via the job URL.");
        }
      } else {
        console.log("[greenhouse-live] No code entered — complete manually via the job URL.");
      }
    }

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
// Stdin prompt for verification code
// ---------------------------------------------------------------------------

/**
 * Prompt the operator for the Greenhouse security code via stdin.
 * Returns the trimmed code, or null if the operator skips or times out (5 min).
 */
async function promptForVerificationCode(
  timeoutMs: number,
): Promise<string | null> {
  const { createInterface } = await import("node:readline");
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const timeout = setTimeout(() => {
      rl.close();
      const minutes = (timeoutMs / 60_000).toFixed(0);
      console.log(`\n[greenhouse-live] Code entry timed out (${minutes} minutes).`);
      resolve(null);
    }, timeoutMs);

    rl.question(
      "[greenhouse-live] Enter verification code (or press Enter to skip): ",
      (input) => {
        clearTimeout(timeout);
        rl.close();
        const trimmed = input.trim().replace(/\s/g, "");
        resolve(trimmed.length > 0 ? trimmed : null);
      },
    );
  });
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
