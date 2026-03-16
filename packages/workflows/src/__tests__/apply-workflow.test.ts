/**
 * End-to-end test: applyWorkflow — REVIEW_BEFORE_SUBMIT mode
 *
 * Validates the core review-gate orchestration at the workflow level:
 *   1. applyWorkflow enters the waiting_review phase (blocks at condition).
 *   2. reviewApprovalSignal { approved: true }  → workflow continues → SUBMITTED.
 *   3. reviewApprovalSignal { approved: false } → workflow returns  → CANCELLED.
 *   4. cancelRequestSignal during review gate   → workflow returns  → CANCELLED.
 *   5. FULL_AUTO mode skips the review gate entirely         → SUBMITTED.
 *   6. Query surfaces (workflowStatus, progress, currentState) are coherent
 *      while the workflow is blocked in waiting_review.
 *
 * Test design
 * -----------
 * @temporalio/workflow is intercepted at the Node.js module-load level by
 * temporal-mock.ts (loaded via --require before this file).  The mock
 * provides in-process implementations of proxyActivities, setHandler, and
 * condition so the workflow function runs as a plain async function with no
 * Temporal worker required.
 *
 * Activity stubs are configured to bypass the browser-automation loop:
 *   - initActivity  → succeeds, sets nextState = SUBMIT (skips browser loop)
 *   - submitActivity → succeeds, sets nextState = CAPTURE_CONFIRMATION
 *   - captureActivity → succeeds, returns confirmationId
 *
 * Signal delivery is synchronous from the test's perspective:
 *   sendSignal() → calls the workflow's signal handler → _checkConditions()
 *   → resolves the pending condition() Promise → workflow resumes on the
 *   next microtask tick → await workflowPromise collects the result.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { RunMode, RunOutcome, StateName, AtsType } from "@dejsol/core";

// temporal-mock.ts must already be loaded (via --require) at this point.
// Importing it here gives us the shared mockHelpers reference.
import { mockHelpers } from "./helpers/temporal-mock.js";

// Import workflow and signal/query definitions AFTER the mock is wired.
// (Module._load interception ensures these modules see mock Temporal APIs.)
import { applyWorkflow } from "../apply-workflow.js";
import type { ApplyWorkflowInput, ApplyWorkflowResult } from "../apply-workflow.js";
import { reviewApprovalSignal, cancelRequestSignal } from "../signals.js";
import type { WorkflowStatus, WorkflowProgress } from "../queries.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT: ApplyWorkflowInput = {
  runId: "run-e2e-001",
  jobId: "job-e2e-001",
  candidateId: "cand-e2e-001",
  jobUrl: "https://jobs.example.com/eng-e2e",
  mode: RunMode.REVIEW_BEFORE_SUBMIT,
  atsType: AtsType.GREENHOUSE,
};

/**
 * Yield to the event loop, flushing all pending microtasks.
 * After this, any workflow that has reached an unresolved condition()
 * will be suspended there.
 */
function drainMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// Activity stub factories
// ---------------------------------------------------------------------------

/** initActivity stub that advances directly to SUBMIT (bypasses browser loop). */
function stubInit(options?: { success?: boolean; error?: string }) {
  const success = options?.success ?? true;
  mockHelpers.setActivityMock("initActivity", async () => ({
    success,
    nextState: success ? StateName.SUBMIT : StateName.ESCALATE,
    data: { stub: "init" },
    ...(options?.error ? { error: options.error } : {}),
  }));
}

/** submitActivity stub. */
function stubSubmit(options?: { success?: boolean; error?: string }) {
  const success = options?.success ?? true;
  mockHelpers.setActivityMock("submitActivity", async () => ({
    success,
    nextState: success ? StateName.CAPTURE_CONFIRMATION : StateName.ESCALATE,
    data: { stub: "submit" },
    ...(options?.error ? { error: options.error } : {}),
  }));
}

/** captureActivity stub. */
function stubCapture(options?: { success?: boolean; confirmationId?: string }) {
  const success = options?.success ?? true;
  mockHelpers.setActivityMock("captureActivity", async () => ({
    success,
    confirmationId: success ? (options?.confirmationId ?? "CONF-E2E-001") : undefined,
    data: { stub: "capture" },
    ...((!success) ? { error: "capture failed" } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyWorkflow — REVIEW_BEFORE_SUBMIT orchestration", () => {
  beforeEach(() => {
    mockHelpers.resetState();
  });

  // ── Approval path ─────────────────────────────────────────────────────────

  describe("approval path", () => {
    it("enters waiting_review phase and blocks at the review gate", async () => {
      stubInit();
      stubSubmit();
      stubCapture();

      const workflowPromise = applyWorkflow(BASE_INPUT);

      // Let the workflow run until it suspends at condition().
      await drainMicrotasks();

      // The workflow should now be parked in waiting_review.
      const status = mockHelpers.queryState("workflowStatus") as WorkflowStatus;
      assert.equal(status.phase, "waiting_review");
      assert.equal(status.currentState, StateName.SUBMIT);
      assert.ok(
        status.statesCompleted.includes(StateName.INIT),
        "INIT should be completed before reaching the review gate",
      );
      assert.deepEqual(status.errors, []);

      // Clean up: approve so the promise settles and the test exits cleanly.
      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      await workflowPromise;
    });

    it("unblocks and returns SUBMITTED when reviewer approves", async () => {
      stubInit();
      stubSubmit();
      stubCapture({ confirmationId: "CONF-APPROVE-001" });

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });

      const result: ApplyWorkflowResult = await workflowPromise;

      assert.equal(result.outcome, RunOutcome.SUBMITTED);
      assert.equal(result.confirmationId, "CONF-APPROVE-001");
      assert.equal(result.finalState, StateName.CAPTURE_CONFIRMATION);
      assert.ok(result.statesCompleted.includes(StateName.SUBMIT));
      assert.ok(result.statesCompleted.includes(StateName.CAPTURE_CONFIRMATION));
      assert.deepEqual(result.errors, []);
    });

    it("forwards reviewer edits to submitActivity when approved with edits", async () => {
      stubInit();

      let capturedEdits: Record<string, string> | undefined;
      mockHelpers.setActivityMock("submitActivity", async (input: unknown) => {
        capturedEdits = (input as { reviewerEdits?: Record<string, string> })
          .reviewerEdits;
        return {
          success: true,
          nextState: StateName.CAPTURE_CONFIRMATION,
          data: {},
        };
      });
      stubCapture();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      const edits = { coverLetterNote: "Updated note" };
      mockHelpers.sendSignal(reviewApprovalSignal.name, {
        approved: true,
        edits,
      });

      const result = await workflowPromise;

      assert.equal(result.outcome, RunOutcome.SUBMITTED);
      assert.deepEqual(capturedEdits, edits);
    });
  });

  // ── Rejection path ────────────────────────────────────────────────────────

  describe("rejection path", () => {
    it("returns CANCELLED when reviewer rejects (approved: false)", async () => {
      stubInit();
      stubSubmit();
      stubCapture();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: false });

      const result: ApplyWorkflowResult = await workflowPromise;

      assert.equal(result.outcome, RunOutcome.CANCELLED);
      // submit and capture must NOT have been called
      assert.ok(!result.statesCompleted.includes(StateName.SUBMIT));
      assert.ok(!result.statesCompleted.includes(StateName.CAPTURE_CONFIRMATION));
    });

    it("returns CANCELLED when cancelRequestSignal is received during review wait", async () => {
      stubInit();
      stubSubmit();
      stubCapture();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      mockHelpers.sendSignal(cancelRequestSignal.name, {
        reason: "User cancelled",
      });

      const result: ApplyWorkflowResult = await workflowPromise;

      assert.equal(result.outcome, RunOutcome.CANCELLED);
    });
  });

  // ── Query surfaces ────────────────────────────────────────────────────────

  describe("query surface coherence during waiting_review", () => {
    it("currentState query returns SUBMIT while blocked", async () => {
      stubInit();
      stubSubmit();
      stubCapture();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      const currentState = mockHelpers.queryState("currentState");
      assert.equal(currentState, StateName.SUBMIT);

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: true });
      await workflowPromise;
    });

    it("progress query reflects completed states and waiting_review phase", async () => {
      stubInit();
      stubSubmit();
      stubCapture();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      const progress = mockHelpers.queryState("progress") as WorkflowProgress;

      assert.equal(progress.phase, "waiting_review");
      assert.equal(progress.currentState, StateName.SUBMIT);
      assert.ok(
        progress.completedStates >= 1,
        "At least INIT should be completed",
      );
      assert.equal(progress.totalStates, 14);
      assert.ok(
        progress.percentComplete >= 0 && progress.percentComplete <= 100,
        `percentComplete out of range: ${progress.percentComplete}`,
      );

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: false });
      await workflowPromise;
    });

    it("workflowStatus errors array is empty while waiting for review", async () => {
      stubInit();
      stubSubmit();
      stubCapture();

      const workflowPromise = applyWorkflow(BASE_INPUT);
      await drainMicrotasks();

      const status = mockHelpers.queryState("workflowStatus") as WorkflowStatus;
      assert.deepEqual(status.errors, []);

      mockHelpers.sendSignal(reviewApprovalSignal.name, { approved: false });
      await workflowPromise;
    });
  });

  // ── FULL_AUTO mode (control: no review gate) ──────────────────────────────

  describe("FULL_AUTO mode — review gate is skipped", () => {
    it("proceeds to SUBMITTED without any signal in FULL_AUTO mode", async () => {
      stubInit();
      stubSubmit();
      stubCapture({ confirmationId: "CONF-AUTO-001" });

      const result = await applyWorkflow({
        ...BASE_INPUT,
        mode: RunMode.FULL_AUTO,
      });

      assert.equal(result.outcome, RunOutcome.SUBMITTED);
      assert.equal(result.confirmationId, "CONF-AUTO-001");
      assert.ok(result.statesCompleted.includes(StateName.SUBMIT));
      assert.ok(result.statesCompleted.includes(StateName.CAPTURE_CONFIRMATION));
    });
  });

  // ── Init failure (guard: workflow fails before review gate) ───────────────

  describe("init failure — workflow exits before reaching review gate", () => {
    it("returns FAILED when initActivity reports failure", async () => {
      stubInit({ success: false, error: "DB lookup failed" });
      // Submit and capture should never be called.

      const result = await applyWorkflow(BASE_INPUT);

      assert.equal(result.outcome, RunOutcome.FAILED);
      assert.ok(result.errors.length > 0);
      assert.equal(result.errors[0]?.state, StateName.INIT);
    });
  });
});
