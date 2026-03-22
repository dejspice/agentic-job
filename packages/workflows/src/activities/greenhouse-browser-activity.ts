/**
 * Greenhouse Happy-Path Browser Activity
 *
 * Executes the full Greenhouse application flow in a single browser session.
 *
 * Session continuity:
 *   All states share one Playwright Page so navigation, form state, and
 *   cookies persist between state transitions — this is the key difference
 *   from the per-state browserActivity, which cannot maintain a live page
 *   across Temporal activity boundaries.
 *
 * Scope:
 *   OPEN_JOB_PAGE → DETECT_APPLY_ENTRY → LOGIN_OR_CONTINUE → UPLOAD_RESUME →
 *   WAIT_FOR_PARSE → VALIDATE_PARSED_PROFILE → FILL_REQUIRED_FIELDS →
 *   ANSWER_SCREENING_QUESTIONS → REVIEW_DISCLOSURES → PRE_SUBMIT_CHECK →
 *   SUBMIT → CAPTURE_CONFIRMATION
 *
 * Designed for FULL_AUTO mode only.  REVIEW_BEFORE_SUBMIT support (pausing
 * before SUBMIT so a human can inspect) is deferred — the full session would
 * need to be persisted across the review gate signal, which requires a
 * session-persistence layer not yet implemented.
 *
 * Two entry points
 * ────────────────
 * executeGreenhouseHappyPath({ page, store, … })
 *   Core execution loop — accepts any Playwright Page from any source.
 *   Used by both the Temporal activity wrapper and the live-target harness.
 *
 * runGreenhouseHappyPathActivity(input)
 *   Temporal activity wrapper.  Allocates a local Chromium session, calls
 *   executeGreenhouseHappyPath, then releases the browser.
 *
 * Artifacts:
 *   Captured via the provided ArtifactStore during the run, returned in the
 *   result.  Each ArtifactReference carries its originating StateName in the
 *   `state` field so the workflow can re-index them into RunArtifactBundle.byState.
 *
 * Idempotency:
 *   Temporal may retry this activity on failure.  The activity re-opens a
 *   fresh browser session from the beginning of the Greenhouse path.
 */

import { chromium } from "playwright";
import type { Page } from "playwright";
import { StateName } from "@dejsol/core";
import type { ArtifactReference } from "@dejsol/core";
import {
  BrowserWorker,
  InMemoryArtifactStore,
  captureScreenshot,
  captureDomSnapshot,
  type ArtifactStore,
} from "@dejsol/browser-worker";
import { ApplyStateMachine } from "@dejsol/state-machine";
import type { StateContext, StateOutcome } from "@dejsol/state-machine";

// ---------------------------------------------------------------------------
// State sequence
// ---------------------------------------------------------------------------

/**
 * Ordered states executed inside the single Greenhouse browser session.
 * Mirrors the canonical STATE_ORDER for Greenhouse, excluding INIT and ESCALATE
 * (handled by the workflow directly).
 */
const GREENHOUSE_BROWSER_STATES: ReadonlyArray<StateName> = [
  StateName.OPEN_JOB_PAGE,
  StateName.DETECT_APPLY_ENTRY,
  StateName.LOGIN_OR_CONTINUE,          // no-op — no login wall on Greenhouse public boards
  StateName.UPLOAD_RESUME,
  StateName.WAIT_FOR_PARSE,
  StateName.VALIDATE_PARSED_PROFILE,    // no-op — stub; mismatch detection is a later phase
  StateName.FILL_REQUIRED_FIELDS,
  StateName.ANSWER_SCREENING_QUESTIONS, // no-op — answer bank integration is a later phase
  StateName.REVIEW_DISCLOSURES,         // no-op — EEOC/disclosure automation is a later phase
  StateName.PRE_SUBMIT_CHECK,
  StateName.SUBMIT,
  StateName.CAPTURE_CONFIRMATION,
] as const;

// ---------------------------------------------------------------------------
// I/O types
// ---------------------------------------------------------------------------

export interface GreenhouseHappyPathInput {
  runId: string;
  jobId: string;
  candidateId: string;
  /** Greenhouse job URL (boards.greenhouse.io/…). */
  jobUrl: string;
  /**
   * Data bag seeded by initActivity.  Must include:
   *   data.resumeFile    — absolute path to the resume file to upload
   *   data.candidate     — { firstName, lastName, email, phone }
   */
  data: Record<string, unknown>;
}

export interface GreenhouseHappyPathResult {
  /** Overall outcome of the execution slice. */
  outcome: StateOutcome;
  /** States that completed successfully, in execution order. */
  statesCompleted: StateName[];
  /** Last state reached before the activity returned. */
  finalState: StateName;
  /**
   * Application confirmation ID extracted from the confirmation page.
   * Present when outcome === 'success'.
   * Falls back to a synthetic CONF-<runId prefix> when not extractable.
   */
  confirmationId?: string;
  /** Updated data bag — merges context changes produced across all states. */
  data: Record<string, unknown>;
  /**
   * All ArtifactReferences captured during this activity.
   * Each ref carries a `state` field so the workflow can rebuild byState.
   */
  artifacts: ArtifactReference[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Core execution — accepts any Playwright Page from any provider
// ---------------------------------------------------------------------------

/**
 * Execute the hardened Greenhouse happy-path state sequence on the given Page.
 *
 * This function is provider-agnostic: the Page may come from a local
 * Chromium launch, Bright Data, Browserbase, or any other source.  Caller is
 * responsible for acquiring and releasing the browser session.
 *
 * Artifact capture uses the provided ArtifactStore so callers can plug in
 * InMemoryArtifactStore (tests / Temporal activity) or LocalFileArtifactStore
 * (live-target harness / debug runs).
 */
export async function executeGreenhouseHappyPath({
  page,
  store,
  runId,
  jobId,
  candidateId,
  jobUrl,
  data,
}: {
  page: Page;
  store: ArtifactStore;
  runId: string;
  jobId: string;
  candidateId: string;
  jobUrl: string;
  data: Record<string, unknown>;
}): Promise<GreenhouseHappyPathResult> {
  const worker = new BrowserWorker(page);
  const sm = new ApplyStateMachine();

  // Accumulate artifact references as they are captured.
  // We collect them here rather than calling store.getRefs() because the
  // base ArtifactStore interface does not expose a getRefs() method —
  // only InMemoryArtifactStore has it.  LocalFileArtifactStore (used by the
  // live-target harness) writes to disk but does not maintain a refs list.
  const capturedArtifacts: ArtifactReference[] = [];

  // Build the StateContext.
  // captureArtifact reads stateContext.currentState at call-time so it
  // always tags artifacts with the state that was active at capture.
  const stateContext: StateContext = {
    runId,
    jobId,
    candidateId,
    jobUrl,
    currentState: StateName.OPEN_JOB_PAGE,
    stateHistory: [],
    data: { ...data },
    execute: (cmd) => worker.execute(cmd),
    captureArtifact: async (kind, label, captureOpts) => {
      const stateStr = String(stateContext.currentState);
      let ref: ArtifactReference;
      if (kind === "screenshot" || kind === "confirmation_screenshot") {
        const raw = await captureScreenshot(page, label, captureOpts?.fullPage);
        raw.kind = kind;
        ref = await store.save(runId, raw, { state: stateStr });
      } else {
        const raw = await captureDomSnapshot(page, label, captureOpts?.scope);
        ref = await store.save(runId, raw, { state: stateStr });
      }
      capturedArtifacts.push(ref);
      return ref;
    },
  };

  const statesCompleted: StateName[] = [];
  let finalState: StateName = StateName.OPEN_JOB_PAGE;

  // Execute each state in sequence within the shared browser session.
  for (const stateName of GREENHOUSE_BROWSER_STATES) {
    stateContext.currentState = stateName;

    let stateResult;
    try {
      stateResult = await sm.executeState(stateName, stateContext);
    } catch (err) {
      return {
        outcome: "failure",
        statesCompleted,
        finalState: stateName,
        data: stateContext.data,
        artifacts: capturedArtifacts,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    finalState = stateName;

    // Merge state-produced data into the shared context bag.
    if (stateResult.data) {
      Object.assign(stateContext.data, stateResult.data);
    }

    // Append to the immutable stateHistory (spread creates a new array).
    stateContext.stateHistory = [
      ...stateContext.stateHistory,
      { state: stateName, outcome: stateResult.outcome },
    ];

    if (stateResult.outcome === "escalated") {
      return {
        outcome: "escalated",
        statesCompleted,
        finalState: stateName,
        data: stateContext.data,
        artifacts: capturedArtifacts,
        error: stateResult.error,
      };
    }

    if (stateResult.outcome === "failure") {
      // Activity-level safety-net: capture a failure screenshot if the
      // state handler didn't already produce one (best-effort, never masks
      // the original failure).
      if (stateContext.captureArtifact) {
        try {
          await stateContext.captureArtifact(
            "screenshot",
            `${String(stateName)}-activity-failure`,
          );
        } catch {
          // Swallow — never obscure the original failure reason.
        }
      }
      return {
        outcome: "failure",
        statesCompleted,
        finalState: stateName,
        data: stateContext.data,
        artifacts: capturedArtifacts,
        error: stateResult.error ?? `State ${stateName} failed`,
      };
    }

    statesCompleted.push(stateName);
  }

  // Extract confirmation ID from state context.
  // captureConfirmationState sets data.confirmationId from the page if
  // extractable; fall back to a synthetic identifier when not available.
  const confirmationId =
    (stateContext.data.confirmationId as string | undefined) ??
    `CONF-${runId.slice(0, 8).toUpperCase()}`;

  return {
    outcome: "success",
    statesCompleted,
    finalState,
    confirmationId,
    data: stateContext.data,
    artifacts: capturedArtifacts,
  };
}

// ---------------------------------------------------------------------------
// Temporal activity wrapper
// ---------------------------------------------------------------------------

/**
 * Execute the full Greenhouse happy-path in a single browser session.
 *
 * This is a Temporal activity — it runs in the activity worker with full
 * Node.js access (no sandbox restrictions).
 *
 * It allocates a local Chromium session, delegates to executeGreenhouseHappyPath,
 * then releases the browser regardless of outcome.
 */
export async function runGreenhouseHappyPathActivity(
  input: GreenhouseHappyPathInput,
): Promise<GreenhouseHappyPathResult> {
  const { runId, jobId, candidateId, jobUrl, data } = input;

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const store = new InMemoryArtifactStore();

    return await executeGreenhouseHappyPath({
      page,
      store,
      runId,
      jobId,
      candidateId,
      jobUrl,
      data,
    });
  } finally {
    await browser.close();
  }
}
