/**
 * Greenhouse Happy-Path Integration Test
 *
 * Proves the full execution slice:
 *   OPEN_JOB_PAGE → DETECT_APPLY_ENTRY → UPLOAD_RESUME → WAIT_FOR_PARSE →
 *   FILL_REQUIRED_FIELDS → PRE_SUBMIT_CHECK → SUBMIT → CAPTURE_CONFIRMATION
 *
 * Uses a local Greenhouse fixture HTML page served via file:// protocol,
 * a real Playwright browser, the BrowserWorker command executor,
 * and the InMemoryArtifactStore.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

import { StateName } from "@dejsol/core";
import type { WorkerCommand, ArtifactKind, ArtifactReference } from "@dejsol/core";
import { ApplyStateMachine } from "@dejsol/state-machine";
import type { StateContext, StateResult } from "@dejsol/state-machine";
import { BrowserWorker, InMemoryArtifactStore, captureScreenshot, captureDomSnapshot } from "@dejsol/browser-worker";

import { greenhouseAccelerator } from "../greenhouse/index.js";

const FIXTURE_PATH = path.resolve(__dirname, "fixtures", "greenhouse-fixture.html");
const RESUME_PATH = path.resolve(__dirname, "fixtures", "test-resume.txt");

const HAPPY_PATH_STATES: StateName[] = [
  StateName.OPEN_JOB_PAGE,
  StateName.DETECT_APPLY_ENTRY,
  StateName.UPLOAD_RESUME,
  StateName.WAIT_FOR_PARSE,
  StateName.FILL_REQUIRED_FIELDS,
  StateName.PRE_SUBMIT_CHECK,
  StateName.SUBMIT,
  StateName.CAPTURE_CONFIRMATION,
];

function buildExecutor(worker: BrowserWorker) {
  return (command: WorkerCommand) => worker.execute(command);
}

function buildArtifactCaptureFn(
  page: Page,
  store: InMemoryArtifactStore,
  runId: string,
  currentState: string,
) {
  return async (
    kind: ArtifactKind,
    label: string,
    options?: { fullPage?: boolean; scope?: string },
  ): Promise<ArtifactReference> => {
    if (kind === "screenshot" || kind === "confirmation_screenshot") {
      const artifact = await captureScreenshot(page, label, options?.fullPage);
      artifact.kind = kind;
      return store.save(runId, artifact, { state: currentState });
    }
    const artifact = await captureDomSnapshot(page, label, options?.scope);
    return store.save(runId, artifact, { state: currentState });
  };
}

describe("Greenhouse happy-path integration", () => {
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

  it("executes the full happy path against the Greenhouse fixture", async () => {
    const sm = new ApplyStateMachine();
    const worker = new BrowserWorker(page);
    const store = new InMemoryArtifactStore();
    const runId = "integration-test-run-001";

    const context: StateContext = {
      runId,
      jobId: "job-gh-42",
      candidateId: "cand-test-1",
      jobUrl: `file://${FIXTURE_PATH}`,
      currentState: StateName.INIT,
      stateHistory: [],
      data: {
        resumeFile: RESUME_PATH,
        candidate: {
          firstName: "Jane",
          lastName: "Doe",
          email: "jane.doe@example.com",
          phone: "(555) 123-4567",
        },
      },
      execute: buildExecutor(worker),
      captureArtifact: buildArtifactCaptureFn(page, store, runId, ""),
    };

    const results: Array<{ state: StateName; result: StateResult }> = [];

    for (const stateName of HAPPY_PATH_STATES) {
      context.currentState = stateName;

      // Update the captureArtifact closure with the current state name
      context.captureArtifact = buildArtifactCaptureFn(page, store, runId, stateName);

      const result = await sm.executeState(stateName, context);
      results.push({ state: stateName, result });

      // Merge result data into context
      if (result.data) {
        Object.assign(context.data, result.data);
      }
      context.stateHistory = [
        ...context.stateHistory,
        { state: stateName, outcome: result.outcome },
      ];

      assert.equal(
        result.outcome,
        "success",
        `State ${stateName} failed: ${result.error ?? "no error message"}`,
      );
    }

    // Verify all 8 states completed successfully
    assert.equal(results.length, HAPPY_PATH_STATES.length);
    for (const { state, result } of results) {
      assert.equal(result.outcome, "success", `${state} should succeed`);
    }

    // Verify artifacts were captured
    const refs = store.getRefs(runId);
    assert.ok(refs.length > 0, "Expected artifacts to be captured");

    const screenshotArtifacts = refs.filter(
      (r) => r.kind === "screenshot" || r.kind === "confirmation_screenshot",
    );
    assert.ok(screenshotArtifacts.length >= 3, `Expected ≥3 screenshots, got ${screenshotArtifacts.length}`);

    const domSnapshots = refs.filter((r) => r.kind === "dom_snapshot");
    assert.ok(domSnapshots.length >= 1, `Expected ≥1 DOM snapshots, got ${domSnapshots.length}`);

    // Verify confirmation was captured
    assert.ok(context.data.confirmationText, "Confirmation text should be captured");
    assert.equal(context.data.runOutcome, "SUBMITTED");
    assert.ok(context.data.submitted === true, "submitted flag should be set");

    // Verify artifacts have state labels
    const statesWithArtifacts = new Set(refs.map((r) => r.state).filter(Boolean));
    assert.ok(
      statesWithArtifacts.size >= 3,
      `Expected artifacts from ≥3 states, got ${statesWithArtifacts.size}`,
    );
  });

  it("verifies the Greenhouse accelerator is used (classifiers exist)", () => {
    assert.ok(greenhouseAccelerator.pageClassifiersJson.length > 0);
    assert.ok(greenhouseAccelerator.formSchemaJson.length > 0);
    assert.ok(greenhouseAccelerator.pathTemplatesJson.length > 0);
    assert.equal(greenhouseAccelerator.atsType, "GREENHOUSE");
  });

  it("captures artifacts at each key transition", async () => {
    const sm = new ApplyStateMachine();
    const worker = new BrowserWorker(page);
    const store = new InMemoryArtifactStore();
    const runId = "artifact-trace-run-002";

    const context: StateContext = {
      runId,
      jobId: "job-gh-43",
      candidateId: "cand-test-2",
      jobUrl: `file://${FIXTURE_PATH}`,
      currentState: StateName.INIT,
      stateHistory: [],
      data: {
        resumeFile: RESUME_PATH,
        candidate: {
          firstName: "John",
          lastName: "Smith",
          email: "john.smith@example.com",
          phone: "(555) 987-6543",
        },
      },
      execute: buildExecutor(worker),
      captureArtifact: buildArtifactCaptureFn(page, store, runId, ""),
    };

    for (const stateName of HAPPY_PATH_STATES) {
      context.currentState = stateName;
      context.captureArtifact = buildArtifactCaptureFn(page, store, runId, stateName);
      const result = await sm.executeState(stateName, context);
      if (result.data) Object.assign(context.data, result.data);
      context.stateHistory = [
        ...context.stateHistory,
        { state: stateName, outcome: result.outcome },
      ];
    }

    const refs = store.getRefs(runId);

    // Check that artifact data is actually populated (not empty)
    for (const ref of refs) {
      const data = store.getData(ref.url);
      assert.ok(data !== undefined, `Artifact ${ref.label} should have data`);
      if (Buffer.isBuffer(data)) {
        assert.ok(data.length > 0, `Screenshot ${ref.label} should have non-zero bytes`);
      } else {
        assert.ok(data.length > 0, `Snapshot ${ref.label} should have non-zero content`);
      }
    }
  });
});
