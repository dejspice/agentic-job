/**
 * Vertical integration test: review-mode flow — full end-to-end slice
 *
 * What this proves:
 *   1. applyWorkflow in REVIEW_BEFORE_SUBMIT mode traverses the full state
 *      machine loop (OPEN_JOB_PAGE → PRE_SUBMIT_CHECK via browserActivity)
 *      before parking at the review gate.
 *   2. Artifact references produced by each activity accumulate correctly in
 *      the RunArtifactBundle, indexed by state in byState.
 *   3. bundleToArtifactUrls() converts the bundle to the ArtifactUrls shape
 *      used by ApplyRun.artifactUrlsJson for DB persistence — all URLs are
 *      non-empty strings.
 *   4. The approval path completes with SUBMITTED outcome, includes all 13
 *      expected states in statesCompleted, and carries a confirmationId.
 *   5. The rejection path returns CANCELLED without calling submit or capture.
 *   6. FULL_AUTO mode skips the review gate entirely.
 *   7. The result shape maps cleanly to the API's RunStatusResponse DTO.
 *
 * Unlike apply-workflow.test.ts (which stubs activities to bypass the browser
 * loop), this test wires the REAL activity implementations so the full state
 * machine execution path is exercised end-to-end.
 *
 * Test harness
 * ------------
 * temporal-mock.ts is loaded via --require before this file.  The mock proxy
 * intercepts @temporalio/workflow and lets us call the real activity functions
 * via setActivityMock() — the workflow runtime calls them through proxyActivities
 * just as it would in production, but in-process with no Temporal worker.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { RunMode, RunOutcome, StateName, AtsType } from "@dejsol/core";
import type { ArtifactUrls } from "@dejsol/core";

import { mockHelpers } from "../helpers/temporal-mock.js";
import { applyWorkflow } from "../../apply-workflow.js";
import type { ApplyWorkflowInput, ApplyWorkflowResult } from "../../apply-workflow.js";
import { reviewApprovalSignal } from "../../signals.js";
import { bundleToArtifactUrls } from "../../artifacts.js";

// Real activity implementations — wired directly into the mock proxy.
import { initActivity } from "../../activities/init-activity.js";
import { browserActivity } from "../../activities/browser-activity.js";
import { submitActivity } from "../../activities/submit-activity.js";
import { captureActivity } from "../../activities/capture-activity.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STATES = 14;

/** All states that should appear in statesCompleted on the happy path. */
const HAPPY_PATH_STATES: StateName[] = [
  StateName.INIT,
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
// Fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT: ApplyWorkflowInput = {
  runId: "run-intg-001",
  jobId: "job-intg-001",
  candidateId: "cand-intg-001",
  jobUrl: "https://boards.greenhouse.io/example/jobs/1234",
  mode: RunMode.REVIEW_BEFORE_SUBMIT,
  atsType: AtsType.GREENHOUSE,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Yield to the event loop, flushing all pending microtasks.
 * After this, any workflow parked at condition() will be suspended.
 */
function drainMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Wire the REAL activity implementations into the mock proxy.
 * The workflow calls them through proxyActivities by name; the mock
 * dispatches to these functions instead of a Temporal worker.
 */
function wireRealActivities(): void {
  mockHelpers.setActivityMock(
    "initActivity",
    (input: unknown) =>
      initActivity(input as Parameters<typeof initActivity>[0]),
  );
  mockHelpers.setActivityMock(
    "browserActivity",
    (input: unknown) =>
      browserActivity(input as Parameters<typeof browserActivity>[0]),
  );
  mockHelpers.setActivityMock(
    "submitActivity",
    (input: unknown) =>
      submitActivity(input as Parameters<typeof submitActivity>[0]),
  );
  mockHelpers.setActivityMock(
    "captureActivity",
    (input: unknown) =>
      captureActivity(input as Parameters<typeof captureActivity>[0]),
  );
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("review-mode flow — vertical integration", () => {
  beforeEach(() => {
    mockHelpers.resetState();
  });

  // ── Approval path: full state machine traversal ─────────────────────────

  describe("approval path — full state machine traversal", () => {
    it("reaches waiting_review phase and blocks at the review gate", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      const status = mockHelpers.queryState("workflowStatus") as {
        phase: string;
        currentState: string;
      };
      assert.equal(status.phase, "waiting_review");
      assert.equal(status.currentState, StateName.SUBMIT);

      // Clean up — approve so the promise settles.
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      await workflowPromise;
    });

    it("completes with SUBMITTED outcome and a confirmationId", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      assert.equal(result.outcome, RunOutcome.SUBMITTED);
      assert.ok(
        typeof result.confirmationId === "string" &&
          result.confirmationId.length > 0,
        "confirmationId should be a non-empty string",
      );
      assert.equal(result.finalState, StateName.CAPTURE_CONFIRMATION);
      assert.deepEqual(result.errors, []);
    });

    it("includes all 13 happy-path states in statesCompleted", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      for (const state of HAPPY_PATH_STATES) {
        assert.ok(
          result.statesCompleted.includes(state),
          `statesCompleted should include ${state}`,
        );
      }
    });

    it("forwards reviewer edits to submitActivity", async () => {
      wireRealActivities();

      // Override just submitActivity to capture the edits it received.
      let capturedReviewerEdits: Record<string, string> | undefined;
      mockHelpers.setActivityMock(
        "submitActivity",
        async (input: unknown) => {
          const typed = input as Parameters<typeof submitActivity>[0];
          capturedReviewerEdits = typed.reviewerEdits;
          return submitActivity(typed);
        },
      );

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      const edits = { coverLetter: "Updated cover letter" };
      mockHelpers.sendSignal(reviewApprovalSignal.name, {
        approved: true,
        edits,
      });

      const result = await workflowPromise;

      assert.equal(result.outcome, RunOutcome.SUBMITTED);
      assert.deepEqual(capturedReviewerEdits, edits);
    });
  });

  // ── Artifact accumulation ────────────────────────────────────────────────

  describe("artifact accumulation — artifact references survive the full path", () => {
    it("bundle.all is non-empty after a successful run", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      assert.ok(
        result.artifacts.all.length > 0,
        "artifacts.all should contain at least one reference",
      );
    });

    it("screenshot artifacts are captured for screenshot-required states", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      const screenshotLabels = result.artifacts.all
        .filter((a) => a.kind === "screenshot")
        .map((a) => a.label);

      // OPEN_JOB_PAGE requires screenshot per policy
      assert.ok(
        screenshotLabels.some((l) => l.startsWith(StateName.OPEN_JOB_PAGE)),
        "Expected OPEN_JOB_PAGE screenshot",
      );
      // PRE_SUBMIT_CHECK requires screenshot per policy
      assert.ok(
        screenshotLabels.some((l) => l.startsWith(StateName.PRE_SUBMIT_CHECK)),
        "Expected PRE_SUBMIT_CHECK screenshot",
      );
      // submitActivity produces a post-submit screenshot
      assert.ok(
        screenshotLabels.some((l) => l.startsWith(StateName.SUBMIT)),
        "Expected SUBMIT post-submit screenshot",
      );
    });

    it("DOM snapshot artifacts are captured for dom-snapshot-required states", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      const domLabels = result.artifacts.all
        .filter((a) => a.kind === "dom_snapshot")
        .map((a) => a.label);

      // FILL_REQUIRED_FIELDS requires dom_snapshot per policy
      assert.ok(
        domLabels.some((l) => l.startsWith(StateName.FILL_REQUIRED_FIELDS)),
        "Expected FILL_REQUIRED_FIELDS DOM snapshot",
      );
      // ANSWER_SCREENING_QUESTIONS requires dom_snapshot per policy
      assert.ok(
        domLabels.some((l) =>
          l.startsWith(StateName.ANSWER_SCREENING_QUESTIONS),
        ),
        "Expected ANSWER_SCREENING_QUESTIONS DOM snapshot",
      );
    });

    it("confirmation_screenshot artifact appears after capture phase", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      const confirmationArtifact = result.artifacts.all.find(
        (a) => a.kind === "confirmation_screenshot",
      );
      assert.ok(
        confirmationArtifact !== undefined,
        "confirmation_screenshot should be present in artifacts.all",
      );
      assert.ok(
        confirmationArtifact.label.includes(StateName.CAPTURE_CONFIRMATION),
        "confirmation_screenshot label should reference CAPTURE_CONFIRMATION",
      );
    });

    it("artifacts are indexed by state in byState", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      // PRE_SUBMIT_CHECK (screenshot-required) should be indexed
      const preSubmitArtifacts =
        result.artifacts.byState[StateName.PRE_SUBMIT_CHECK];
      assert.ok(
        Array.isArray(preSubmitArtifacts) && preSubmitArtifacts.length > 0,
        "PRE_SUBMIT_CHECK should have indexed artifacts in byState",
      );

      // SUBMIT (post-submit screenshot) should be indexed
      const submitArtifacts = result.artifacts.byState[StateName.SUBMIT];
      assert.ok(
        Array.isArray(submitArtifacts) && submitArtifacts.length > 0,
        "SUBMIT should have indexed artifacts in byState",
      );

      // CAPTURE_CONFIRMATION (confirmation_screenshot) should be indexed
      const captureArtifacts =
        result.artifacts.byState[StateName.CAPTURE_CONFIRMATION];
      assert.ok(
        Array.isArray(captureArtifacts) && captureArtifacts.length > 0,
        "CAPTURE_CONFIRMATION should have indexed artifacts in byState",
      );
    });

    it("all artifact URLs are non-empty strings", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      for (const ref of result.artifacts.all) {
        assert.ok(
          typeof ref.url === "string" && ref.url.length > 0,
          `Artifact ${ref.label} has empty URL`,
        );
        assert.ok(
          typeof ref.capturedAt === "string" && ref.capturedAt.length > 0,
          `Artifact ${ref.label} has empty capturedAt`,
        );
      }
    });
  });

  // ── bundleToArtifactUrls — ArtifactUrls shape coherence ─────────────────

  describe("bundleToArtifactUrls — DB persistence shape", () => {
    it("produces a valid ArtifactUrls object with all expected keys", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      const artifactUrls: ArtifactUrls = bundleToArtifactUrls(result.artifacts);

      assert.ok(
        artifactUrls.screenshots !== undefined,
        "ArtifactUrls should have screenshots",
      );
      assert.ok(
        Object.keys(artifactUrls.screenshots ?? {}).length > 0,
        "screenshots map should be non-empty",
      );
      assert.ok(
        artifactUrls.domSnapshots !== undefined,
        "ArtifactUrls should have domSnapshots",
      );
      assert.ok(
        Object.keys(artifactUrls.domSnapshots ?? {}).length > 0,
        "domSnapshots map should be non-empty",
      );
      assert.ok(
        typeof artifactUrls.confirmationScreenshot === "string" &&
          artifactUrls.confirmationScreenshot.length > 0,
        "confirmationScreenshot URL should be a non-empty string",
      );
    });

    it("screenshot URLs in ArtifactUrls are keyed by artifact label", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      const { screenshots } = bundleToArtifactUrls(result.artifacts);

      for (const [label, url] of Object.entries(screenshots ?? {})) {
        assert.ok(
          typeof label === "string" && label.length > 0,
          "screenshot label key should be non-empty",
        );
        assert.ok(
          typeof url === "string" && url.length > 0,
          `screenshot URL for "${label}" should be non-empty`,
        );
      }
    });

    it("ArtifactUrls shape is compatible with ApplyRun.artifactUrlsJson", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      const artifactUrlsJson: ArtifactUrls = bundleToArtifactUrls(
        result.artifacts,
      );

      // Structural type check: each optional key matches its expected type.
      if (artifactUrlsJson.screenshots !== undefined) {
        assert.equal(typeof artifactUrlsJson.screenshots, "object");
      }
      if (artifactUrlsJson.domSnapshots !== undefined) {
        assert.equal(typeof artifactUrlsJson.domSnapshots, "object");
      }
      if (artifactUrlsJson.confirmationScreenshot !== undefined) {
        assert.equal(typeof artifactUrlsJson.confirmationScreenshot, "string");
      }
      if (artifactUrlsJson.harFile !== undefined) {
        assert.equal(typeof artifactUrlsJson.harFile, "string");
      }
    });
  });

  // ── Rejection path ───────────────────────────────────────────────────────

  describe("rejection path — review gate denied", () => {
    it("returns CANCELLED without calling submit or capture", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: false });
      const result: ApplyWorkflowResult = await workflowPromise;

      assert.equal(result.outcome, RunOutcome.CANCELLED);
      assert.ok(
        !result.statesCompleted.includes(StateName.SUBMIT),
        "SUBMIT should not appear in statesCompleted on rejection",
      );
      assert.ok(
        !result.statesCompleted.includes(StateName.CAPTURE_CONFIRMATION),
        "CAPTURE_CONFIRMATION should not appear in statesCompleted on rejection",
      );
    });

    it("no confirmation_screenshot in artifacts on rejection", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: false });
      const result: ApplyWorkflowResult = await workflowPromise;

      const hasConfirmationScreenshot = result.artifacts.all.some(
        (a) => a.kind === "confirmation_screenshot",
      );
      assert.ok(
        !hasConfirmationScreenshot,
        "confirmation_screenshot should not be present when review is rejected",
      );
    });

    it("bundleToArtifactUrls on a rejected run has no confirmationScreenshot", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: false });
      const result: ApplyWorkflowResult = await workflowPromise;

      const artifactUrls = bundleToArtifactUrls(result.artifacts);
      assert.equal(
        artifactUrls.confirmationScreenshot,
        undefined,
        "confirmationScreenshot should be absent after rejection",
      );
    });
  });

  // ── FULL_AUTO mode ───────────────────────────────────────────────────────

  describe("FULL_AUTO mode — review gate is skipped", () => {
    it("completes with SUBMITTED without any review signal", async () => {
      wireRealActivities();

      const result: ApplyWorkflowResult = await applyWorkflow({
        ...BASE_INPUT,
        mode: RunMode.FULL_AUTO,
      });

      assert.equal(result.outcome, RunOutcome.SUBMITTED);
      assert.ok(result.confirmationId);
      assert.ok(result.statesCompleted.includes(StateName.SUBMIT));
      assert.ok(result.statesCompleted.includes(StateName.CAPTURE_CONFIRMATION));
      assert.deepEqual(result.errors, []);
    });

    it("artifact bundle is identical in structure to REVIEW_BEFORE_SUBMIT", async () => {
      wireRealActivities();

      const result: ApplyWorkflowResult = await applyWorkflow({
        ...BASE_INPUT,
        mode: RunMode.FULL_AUTO,
      });

      // Should have the same kinds of artifacts regardless of run mode.
      const kinds = new Set(result.artifacts.all.map((a) => a.kind));
      assert.ok(kinds.has("screenshot"), "Should have screenshots in FULL_AUTO");
      assert.ok(
        kinds.has("dom_snapshot"),
        "Should have DOM snapshots in FULL_AUTO",
      );
      assert.ok(
        kinds.has("confirmation_screenshot"),
        "Should have confirmation_screenshot in FULL_AUTO",
      );
    });
  });

  // ── API consumer coherence ───────────────────────────────────────────────

  describe("result shape — API consumer coherence", () => {
    it("result maps to RunStatusResponse shape without data loss", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      // Simulate what GET /api/runs/:id/status would build from WorkflowProgress.
      const runStatusShape = {
        runId: BASE_INPUT.runId,
        currentState: result.finalState,
        phase: "completed",
        statesCompleted: result.statesCompleted,
        percentComplete: Math.round(
          (result.statesCompleted.length / TOTAL_STATES) * 100,
        ),
      };

      assert.equal(typeof runStatusShape.runId, "string");
      assert.ok(Array.isArray(runStatusShape.statesCompleted));
      assert.ok(
        runStatusShape.percentComplete >= 0 &&
          runStatusShape.percentComplete <= 100,
        `percentComplete ${runStatusShape.percentComplete} is out of [0,100]`,
      );
      assert.equal(runStatusShape.phase, "completed");
      // 13 states completed out of 14 = ~93%
      assert.ok(
        runStatusShape.percentComplete > 90,
        "percentComplete should be > 90% after completing 13/14 states",
      );
    });

    it("artifactUrlsJson from bundleToArtifactUrls is JSON-serialisable", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      const artifactUrlsJson = bundleToArtifactUrls(result.artifacts);

      // This must not throw — the value must be a plain JSON-safe object.
      const serialised = JSON.stringify(artifactUrlsJson);
      assert.ok(serialised.length > 2, "Serialised artifactUrlsJson is empty");

      const roundTripped = JSON.parse(serialised) as ArtifactUrls;
      assert.deepEqual(roundTripped, artifactUrlsJson);
    });

    it("result.errors is an empty array after clean run", async () => {
      wireRealActivities();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      const result: ApplyWorkflowResult = await workflowPromise;

      assert.deepEqual(result.errors, []);
    });
  });
});
