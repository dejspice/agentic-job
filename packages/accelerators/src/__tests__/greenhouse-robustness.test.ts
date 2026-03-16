/**
 * Greenhouse Robustness Integration Tests
 *
 * Validates that the hardened state handlers work correctly against real
 * Greenhouse variant fixtures with alternate:
 *   - Apply entry CTA (class="apply-button", id="apply-btn")
 *   - Resume upload selector (name*="resume" instead of id*="resume")
 *   - Confirmation element (.confirmation-message instead of .application-confirmation)
 *   - Missing optional field (no phone)
 *
 * Uses a real Playwright browser and the ApplyStateMachine with full
 * BrowserWorker + InMemoryArtifactStore wiring — exactly as the
 * runGreenhouseHappyPathActivity does in production.
 *
 * Run with:
 *   cd packages/accelerators && npm run test:robustness
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

import { StateName } from "@dejsol/core";
import type { WorkerCommand, ArtifactKind, ArtifactReference } from "@dejsol/core";
import { ApplyStateMachine } from "@dejsol/state-machine";
import type { StateContext, StateResult } from "@dejsol/state-machine";
import {
  BrowserWorker,
  InMemoryArtifactStore,
  captureScreenshot,
  captureDomSnapshot,
} from "@dejsol/browser-worker";

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, "fixtures");
const ALT_ENTRY_FIXTURE = path.join(FIXTURES_DIR, "greenhouse-variant-alt-entry.html");
const ALT_CONFIRM_FIXTURE = path.join(FIXTURES_DIR, "greenhouse-variant-alt-confirm.html");
const RESUME_PATH = path.join(FIXTURES_DIR, "test-resume.txt");

// ---------------------------------------------------------------------------
// Happy-path state sequence (mirrors runGreenhouseHappyPathActivity)
// ---------------------------------------------------------------------------

const HAPPY_PATH_STATES: StateName[] = [
  StateName.OPEN_JOB_PAGE,
  StateName.DETECT_APPLY_ENTRY,
  StateName.LOGIN_OR_CONTINUE,
  StateName.UPLOAD_RESUME,
  StateName.WAIT_FOR_PARSE,
  StateName.VALIDATE_PARSED_PROFILE,
  StateName.FILL_REQUIRED_FIELDS,
  StateName.ANSWER_SCREENING_QUESTIONS,
  StateName.REVIEW_DISCLOSURES,
  StateName.PRE_SUBMIT_CHECK,
  StateName.SUBMIT,
  StateName.CAPTURE_CONFIRMATION,
];

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

function buildExecutor(worker: BrowserWorker) {
  return (command: WorkerCommand) => worker.execute(command);
}

function buildArtifactCaptureFn(
  page: Page,
  store: InMemoryArtifactStore,
  runId: string,
  getCurrentState: () => string,
) {
  return async (
    kind: ArtifactKind,
    label: string,
    options?: { fullPage?: boolean; scope?: string },
  ): Promise<ArtifactReference> => {
    const stateStr = getCurrentState();
    if (kind === "screenshot" || kind === "confirmation_screenshot") {
      const artifact = await captureScreenshot(page, label, options?.fullPage);
      artifact.kind = kind;
      return store.save(runId, artifact, { state: stateStr });
    }
    const artifact = await captureDomSnapshot(page, label, options?.scope);
    return store.save(runId, artifact, { state: stateStr });
  };
}

interface RunResult {
  stateResults: Array<{ state: StateName; result: StateResult }>;
  store: InMemoryArtifactStore;
  finalData: Record<string, unknown>;
}

/**
 * Execute the happy-path state sequence against a given fixture URL.
 * Returns per-state results, artifact store, and final context data.
 */
async function runHappyPath(
  page: Page,
  runId: string,
  fixtureUrl: string,
  candidateData: Record<string, unknown> = {},
): Promise<RunResult> {
  const sm = new ApplyStateMachine();
  const worker = new BrowserWorker(page);
  const store = new InMemoryArtifactStore();

  let currentStateName = StateName.OPEN_JOB_PAGE;

  const context: StateContext = {
    runId,
    jobId: `job-${runId}`,
    candidateId: `cand-${runId}`,
    jobUrl: `file://${fixtureUrl}`,
    currentState: StateName.INIT,
    stateHistory: [],
    data: {
      resumeFile: RESUME_PATH,
      candidate: {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@example.com",
        phone: "(555) 111-2222",
        ...candidateData,
      },
    },
    execute: buildExecutor(worker),
    captureArtifact: buildArtifactCaptureFn(page, store, runId, () => String(currentStateName)),
  };

  const stateResults: Array<{ state: StateName; result: StateResult }> = [];

  for (const stateName of HAPPY_PATH_STATES) {
    currentStateName = stateName;
    context.currentState = stateName;

    const result = await sm.executeState(stateName, context);
    stateResults.push({ state: stateName, result });

    if (result.data) Object.assign(context.data, result.data);
    context.stateHistory = [
      ...context.stateHistory,
      { state: stateName, outcome: result.outcome },
    ];
  }

  return { stateResults, store, finalData: context.data };
}

// ---------------------------------------------------------------------------
// Suite 1: Alternate CTA + alternate resume selector
// ---------------------------------------------------------------------------

describe("Greenhouse robustness — alternate apply entry and resume selector", () => {
  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    page = await ctx.newPage();
  });

  after(async () => {
    await browser?.close();
  });

  it("detects and clicks apply-button class CTA (not #app_submit)", async () => {
    const { stateResults } = await runHappyPath(page, "robust-alt-entry-001", ALT_ENTRY_FIXTURE);

    const detectResult = stateResults.find((r) => r.state === StateName.DETECT_APPLY_ENTRY);
    assert.ok(detectResult, "DETECT_APPLY_ENTRY should be in results");
    assert.equal(
      detectResult!.result.outcome,
      "success",
      `DETECT_APPLY_ENTRY failed: ${detectResult!.result.error ?? "no error"}`,
    );
  });

  it("uploads resume using name*=resume fallback selector", async () => {
    const { stateResults, finalData } = await runHappyPath(
      page,
      "robust-alt-entry-002",
      ALT_ENTRY_FIXTURE,
    );

    const uploadResult = stateResults.find((r) => r.state === StateName.UPLOAD_RESUME);
    assert.ok(uploadResult, "UPLOAD_RESUME should be in results");
    assert.equal(
      uploadResult!.result.outcome,
      "success",
      `UPLOAD_RESUME failed: ${uploadResult!.result.error ?? "no error"}`,
    );
    // Verify the name-based selector was used (not id-based)
    assert.ok(
      typeof finalData.resumeSelectorUsed === "string" &&
        (finalData.resumeSelectorUsed.includes("name") ||
          finalData.resumeSelectorUsed.includes("file")),
      `Expected name-based or fallback selector, got: "${finalData.resumeSelectorUsed}"`,
    );
  });

  it("completes the full happy path against the alt-entry variant", async () => {
    const { stateResults } = await runHappyPath(
      page,
      "robust-alt-entry-full-001",
      ALT_ENTRY_FIXTURE,
    );

    for (const { state, result } of stateResults) {
      assert.equal(
        result.outcome,
        "success",
        `State ${state} failed: ${result.error ?? "no error"}`,
      );
    }
  });

  it("artifacts are captured for key states in the alt-entry variant", async () => {
    const { store } = await runHappyPath(
      page,
      "robust-alt-entry-artifacts-001",
      ALT_ENTRY_FIXTURE,
    );

    const refs = store.getRefs("robust-alt-entry-artifacts-001");
    assert.ok(refs.length > 0, "Expected at least one artifact");

    const kinds = new Set(refs.map((r) => r.kind));
    assert.ok(kinds.has("screenshot"), "Expected screenshot artifacts");
    assert.ok(kinds.has("dom_snapshot"), "Expected DOM snapshot artifacts");
    assert.ok(kinds.has("confirmation_screenshot"), "Expected confirmation screenshot");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Alternate confirmation selector + optional phone omitted
// ---------------------------------------------------------------------------

describe("Greenhouse robustness — alternate confirmation and optional phone", () => {
  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    page = await ctx.newPage();
  });

  after(async () => {
    await browser?.close();
  });

  it("submits and captures confirmation via .confirmation-message class", async () => {
    const { stateResults } = await runHappyPath(
      page,
      "robust-alt-confirm-001",
      ALT_CONFIRM_FIXTURE,
    );

    // SUBMIT state should succeed (expanded confirmation wait)
    const submitResult = stateResults.find((r) => r.state === StateName.SUBMIT);
    assert.equal(
      submitResult?.result.outcome,
      "success",
      `SUBMIT failed: ${submitResult?.result.error ?? "no error"}`,
    );

    // CAPTURE_CONFIRMATION should succeed with .confirmation-message
    const captureResult = stateResults.find((r) => r.state === StateName.CAPTURE_CONFIRMATION);
    assert.equal(
      captureResult?.result.outcome,
      "success",
      `CAPTURE_CONFIRMATION failed: ${captureResult?.result.error ?? "no error"}`,
    );
  });

  it("captures confirmation text from .confirmation-message", async () => {
    const { stateResults } = await runHappyPath(
      page,
      "robust-alt-confirm-text-001",
      ALT_CONFIRM_FIXTURE,
    );

    const captureResult = stateResults.find((r) => r.state === StateName.CAPTURE_CONFIRMATION);
    const confirmText = captureResult?.result.data?.confirmationText as string | undefined;
    assert.ok(
      confirmText && (
        confirmText.includes("Thank you") ||
        confirmText.includes("received") ||
        confirmText.includes("screenshot")
      ),
      `Expected confirmation text, got: "${confirmText}"`,
    );
  });

  it("succeeds with no phone field in the alt-confirm variant (optional phone)", async () => {
    // The alt-confirm fixture has no phone input — this tests that
    // fill-required-fields skips phone gracefully when the field is absent.
    const { stateResults } = await runHappyPath(
      page,
      "robust-alt-confirm-nophone-001",
      ALT_CONFIRM_FIXTURE,
      { phone: "(555) 999-0000" }, // provide phone data but form has no phone input
    );

    const fillResult = stateResults.find((r) => r.state === StateName.FILL_REQUIRED_FIELDS);
    assert.equal(
      fillResult?.result.outcome,
      "success",
      `FILL_REQUIRED_FIELDS failed: ${fillResult?.result.error ?? "no error"}`,
    );
  });

  it("completes the full happy path against the alt-confirm variant", async () => {
    const { stateResults } = await runHappyPath(
      page,
      "robust-alt-confirm-full-001",
      ALT_CONFIRM_FIXTURE,
    );

    for (const { state, result } of stateResults) {
      assert.equal(
        result.outcome,
        "success",
        `State ${state} failed: ${result.error ?? "no error"}`,
      );
    }
  });

  it("confirmation screenshot is present in artifacts for alt-confirm variant", async () => {
    const { store } = await runHappyPath(
      page,
      "robust-alt-confirm-screenshot-001",
      ALT_CONFIRM_FIXTURE,
    );

    const refs = store.getRefs("robust-alt-confirm-screenshot-001");
    const confirmScreenshot = refs.find((r) => r.kind === "confirmation_screenshot");
    assert.ok(confirmScreenshot, "Expected confirmation_screenshot artifact");
    assert.ok(
      confirmScreenshot.label.includes("confirmation"),
      `Expected label to include 'confirmation', got: "${confirmScreenshot.label}"`,
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Original fixture still passes (non-regression)
// ---------------------------------------------------------------------------

describe("Greenhouse robustness — original fixture non-regression", () => {
  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    page = await ctx.newPage();
  });

  after(async () => {
    await browser?.close();
  });

  it("original fixture still completes the full happy path after hardening", async () => {
    const originalFixture = path.join(FIXTURES_DIR, "greenhouse-fixture.html");
    const { stateResults } = await runHappyPath(page, "robust-regression-001", originalFixture);

    for (const { state, result } of stateResults) {
      assert.equal(
        result.outcome,
        "success",
        `State ${state} failed: ${result.error ?? "no error"}`,
      );
    }
  });
});
