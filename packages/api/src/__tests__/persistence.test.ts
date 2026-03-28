/**
 * Unit tests for packages/api/src/persistence.ts
 *
 * Validates that persistRunResult():
 *   1. Calls prisma.applyRun.update with the correct runId in where.
 *   2. Maps outcome, finalState, confirmationId, completedAt correctly.
 *   3. Builds stateHistoryJson from statesCompleted + errors.
 *   4. Maps errors to errorLogJson (with recoverable: false).
 *   5. Passes artifactUrls through as artifactUrlsJson unchanged.
 *   6. Defaults costJson to {} when not provided.
 *   7. Accepts an explicit costJson payload.
 *   8. Is idempotent — the second call produces the same data shape.
 *
 * No real database is used.  A minimal mock PrismaClient is constructed
 * that captures the arguments passed to applyRun.update().
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { RunOutcome, StateName, RunMode } from "@dejsol/core";
import type { ArtifactUrls } from "@dejsol/core";
import type { PrismaClient } from "@prisma/client";

import { persistRunResult } from "../persistence.js";
import type { RunResultPayload } from "../persistence.js";

// ---------------------------------------------------------------------------
// Mock PrismaClient factory
// ---------------------------------------------------------------------------

interface CapturedUpdate {
  where: { id: string };
  data: Record<string, unknown>;
}

function makeMockPrisma(): {
  prisma: PrismaClient;
  calls: CapturedUpdate[];
} {
  const calls: CapturedUpdate[] = [];

  const prisma = {
    applyRun: {
      update: async (args: CapturedUpdate) => {
        calls.push(args);
        return {}; // return value unused
      },
    },
  } as unknown as PrismaClient;

  return { prisma, calls };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = "run-persist-test-001";

const ARTIFACT_URLS: ArtifactUrls = {
  screenshots: {
    "PRE_SUBMIT_CHECK/entry": "memory://run-persist-test-001/PRE_SUBMIT_CHECK/screenshot.png",
    "SUBMIT/post-submit": "memory://run-persist-test-001/SUBMIT/post-submit.png",
  },
  domSnapshots: {
    "FILL_REQUIRED_FIELDS/fields": "memory://run-persist-test-001/FILL_REQUIRED_FIELDS/dom.html",
  },
  confirmationScreenshot:
    "memory://run-persist-test-001/CAPTURE_CONFIRMATION/confirmation.png",
};

/** Happy-path payload: SUBMITTED outcome with full state history. */
const SUBMITTED_PAYLOAD: RunResultPayload = {
  outcome: RunOutcome.SUBMITTED,
  finalState: StateName.CAPTURE_CONFIRMATION,
  statesCompleted: [
    StateName.INIT,
    StateName.OPEN_JOB_PAGE,
    StateName.PRE_SUBMIT_CHECK,
    StateName.SUBMIT,
    StateName.CAPTURE_CONFIRMATION,
  ],
  confirmationId: "CONF-ABC123",
  errors: [],
  artifactUrls: ARTIFACT_URLS,
};

/** Rejection payload: CANCELLED, no submit/capture states. */
const CANCELLED_PAYLOAD: RunResultPayload = {
  outcome: RunOutcome.CANCELLED,
  finalState: StateName.SUBMIT,
  statesCompleted: [StateName.INIT, StateName.OPEN_JOB_PAGE, StateName.PRE_SUBMIT_CHECK],
  errors: [],
  artifactUrls: {
    screenshots: {
      "PRE_SUBMIT_CHECK/entry":
        "memory://run-persist-test-001/PRE_SUBMIT_CHECK/screenshot.png",
    },
  },
};

/** Failed payload: one state failed, error in errors array. */
const FAILED_PAYLOAD: RunResultPayload = {
  outcome: RunOutcome.FAILED,
  finalState: StateName.FILL_REQUIRED_FIELDS,
  statesCompleted: [StateName.INIT, StateName.OPEN_JOB_PAGE, StateName.FILL_REQUIRED_FIELDS],
  errors: [
    {
      state: StateName.FILL_REQUIRED_FIELDS,
      message: "Required field 'email' could not be filled",
      timestamp: "2026-01-01T10:00:00.000Z",
    },
  ],
  artifactUrls: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("persistRunResult", () => {
  let mock: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mock = makeMockPrisma();
  });

  // ── Core contract ─────────────────────────────────────────────────────────

  describe("core contract — update is called with correct where and data", () => {
    it("calls applyRun.update once per invocation", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls.length, 1);
    });

    it("uses runId as the where.id selector", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.where.id, RUN_ID);
    });

    it("sets outcome correctly for SUBMITTED", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.data.outcome, RunOutcome.SUBMITTED);
    });

    it("sets outcome correctly for CANCELLED", async () => {
      await persistRunResult(RUN_ID, CANCELLED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.data.outcome, RunOutcome.CANCELLED);
    });

    it("sets outcome correctly for FAILED", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.data.outcome, RunOutcome.FAILED);
    });

    it("sets currentState from finalState", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.data.currentState, StateName.CAPTURE_CONFIRMATION);
    });

    it("sets currentState to null when finalState is null", async () => {
      const payload: RunResultPayload = {
        ...SUBMITTED_PAYLOAD,
        finalState: null,
      };
      await persistRunResult(RUN_ID, payload, mock.prisma);
      assert.equal(mock.calls[0]?.data.currentState, null);
    });

    it("sets confirmationId when present", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.data.confirmationId, "CONF-ABC123");
    });

    it("sets confirmationId to null when absent", async () => {
      await persistRunResult(RUN_ID, CANCELLED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.data.confirmationId, null);
    });

    it("sets completedAt to a Date", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.ok(
        mock.calls[0]?.data.completedAt instanceof Date,
        "completedAt should be a Date instance",
      );
    });
  });

  // ── stateHistoryJson ──────────────────────────────────────────────────────

  describe("stateHistoryJson construction", () => {
    it("contains one entry per state in statesCompleted", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        state: string;
        outcome: string;
      }>;
      assert.equal(history.length, SUBMITTED_PAYLOAD.statesCompleted.length);
    });

    it("all entries have outcome=success when there are no errors", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        outcome: string;
      }>;
      assert.ok(
        history.every((h) => h.outcome === "success"),
        "All states should have outcome=success when no errors",
      );
    });

    it("marks the failing state as outcome=failure", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        state: string;
        outcome: string;
        error?: string;
      }>;
      const fillEntry = history.find(
        (h) => h.state === StateName.FILL_REQUIRED_FIELDS,
      );
      assert.ok(fillEntry !== undefined, "FILL_REQUIRED_FIELDS should be in history");
      assert.equal(fillEntry.outcome, "failure");
      assert.equal(
        fillEntry.error,
        "Required field 'email' could not be filled",
      );
    });

    it("non-failing states remain outcome=success even when errors exist", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        state: string;
        outcome: string;
      }>;
      const initEntry = history.find((h) => h.state === StateName.INIT);
      assert.ok(initEntry !== undefined);
      assert.equal(initEntry.outcome, "success");
    });

    it("state entries preserve chronological order from statesCompleted", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        state: string;
      }>;
      const states = history.map((h) => h.state);
      assert.deepEqual(states, SUBMITTED_PAYLOAD.statesCompleted);
    });

    it("each entry has a non-empty enteredAt string", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        enteredAt: string;
      }>;
      for (const entry of history) {
        assert.ok(
          typeof entry.enteredAt === "string" && entry.enteredAt.length > 0,
          "enteredAt should be a non-empty string",
        );
      }
    });

    it("uses the error timestamp as enteredAt for the failing state", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        state: string;
        enteredAt: string;
      }>;
      const fillEntry = history.find(
        (h) => h.state === StateName.FILL_REQUIRED_FIELDS,
      );
      assert.equal(fillEntry?.enteredAt, "2026-01-01T10:00:00.000Z");
    });
  });

  // ── errorLogJson ─────────────────────────────────────────────────────────

  describe("errorLogJson construction", () => {
    it("is an empty array when there are no errors", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      const errorLog = mock.calls[0]?.data.errorLogJson as unknown[];
      assert.deepEqual(errorLog, []);
    });

    it("contains one entry per error", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      const errorLog = mock.calls[0]?.data.errorLogJson as Array<{
        state: string;
        message: string;
        timestamp: string;
        recoverable: boolean;
      }>;
      assert.equal(errorLog.length, 1);
    });

    it("maps error fields correctly", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      const errorLog = mock.calls[0]?.data.errorLogJson as Array<{
        state: string;
        message: string;
        timestamp: string;
        recoverable: boolean;
      }>;
      const entry = errorLog[0]!;
      assert.equal(entry.state, StateName.FILL_REQUIRED_FIELDS);
      assert.equal(entry.message, "Required field 'email' could not be filled");
      assert.equal(entry.timestamp, "2026-01-01T10:00:00.000Z");
    });

    it("sets recoverable=false for all workflow-level errors", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      const errorLog = mock.calls[0]?.data.errorLogJson as Array<{
        recoverable: boolean;
      }>;
      assert.ok(
        errorLog.every((e) => e.recoverable === false),
        "All workflow-level errors should be non-recoverable",
      );
    });
  });

  // ── artifactUrlsJson ──────────────────────────────────────────────────────

  describe("artifactUrlsJson passthrough", () => {
    it("passes artifactUrls through unchanged as artifactUrlsJson", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.deepEqual(
        mock.calls[0]?.data.artifactUrlsJson,
        ARTIFACT_URLS,
      );
    });

    it("passes empty artifactUrls as artifactUrlsJson={}", async () => {
      await persistRunResult(RUN_ID, FAILED_PAYLOAD, mock.prisma);
      assert.deepEqual(mock.calls[0]?.data.artifactUrlsJson, {});
    });
  });

  // ── costJson ──────────────────────────────────────────────────────────────

  describe("costJson", () => {
    it("defaults to {} when costJson is not provided", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.deepEqual(mock.calls[0]?.data.costJson, {});
    });

    it("passes an explicit costJson payload through", async () => {
      const cost = { inputTokens: 1200, outputTokens: 300, llmCalls: 2 };
      const payload: RunResultPayload = {
        ...SUBMITTED_PAYLOAD,
        costJson: cost,
      };
      await persistRunResult(RUN_ID, payload, mock.prisma);
      assert.deepEqual(mock.calls[0]?.data.costJson, cost);
    });
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  describe("idempotency", () => {
    it("produces identical deterministic fields on a second call with the same payload", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);

      assert.equal(mock.calls.length, 2);

      const first = mock.calls[0]!.data;
      const second = mock.calls[1]!.data;

      // Deterministic fields are identical across calls.
      assert.equal(first.outcome, second.outcome);
      assert.equal(first.currentState, second.currentState);
      assert.equal(first.confirmationId, second.confirmationId);
      assert.deepEqual(first.artifactUrlsJson, second.artifactUrlsJson);
      assert.deepEqual(first.errorLogJson, second.errorLogJson);
      assert.deepEqual(first.costJson, second.costJson);

      // stateHistoryJson: verify structure (state order, outcomes) is identical.
      // enteredAt for error-free states uses new Date() so milliseconds may differ.
      type HistoryEntry = { state: string; outcome: string; error?: string };
      const stripTimestamps = (h: HistoryEntry[]) =>
        h.map(({ state, outcome, error }) => ({ state, outcome, error }));
      assert.deepEqual(
        stripTimestamps(first.stateHistoryJson as HistoryEntry[]),
        stripTimestamps(second.stateHistoryJson as HistoryEntry[]),
      );
    });

    it("both calls use the same runId in where clause", async () => {
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      await persistRunResult(RUN_ID, SUBMITTED_PAYLOAD, mock.prisma);
      assert.equal(mock.calls[0]?.where.id, RUN_ID);
      assert.equal(mock.calls[1]?.where.id, RUN_ID);
    });
  });

  // ── Multiple errors ───────────────────────────────────────────────────────

  describe("multiple errors", () => {
    it("handles multiple error entries across different states", async () => {
      const payload: RunResultPayload = {
        outcome: RunOutcome.FAILED,
        finalState: StateName.SUBMIT,
        statesCompleted: [
          StateName.INIT,
          StateName.FILL_REQUIRED_FIELDS,
          StateName.ANSWER_SCREENING_QUESTIONS,
          StateName.SUBMIT,
        ],
        errors: [
          {
            state: StateName.FILL_REQUIRED_FIELDS,
            message: "Field fill failed",
            timestamp: "2026-01-01T10:00:00.000Z",
          },
          {
            state: StateName.ANSWER_SCREENING_QUESTIONS,
            message: "Answer generation failed",
            timestamp: "2026-01-01T10:05:00.000Z",
          },
        ],
        artifactUrls: {},
      };

      await persistRunResult(RUN_ID, payload, mock.prisma);

      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        state: string;
        outcome: string;
      }>;
      const errorLog = mock.calls[0]?.data.errorLogJson as Array<{
        state: string;
      }>;

      assert.equal(errorLog.length, 2);
      assert.equal(
        history.find((h) => h.state === StateName.FILL_REQUIRED_FIELDS)
          ?.outcome,
        "failure",
      );
      assert.equal(
        history.find((h) => h.state === StateName.ANSWER_SCREENING_QUESTIONS)
          ?.outcome,
        "failure",
      );
      assert.equal(history.find((h) => h.state === StateName.INIT)?.outcome, "success");
    });
  });

  // ── ESCALATED outcome ─────────────────────────────────────────────────────

  describe("ESCALATED outcome", () => {
    it("persists correctly with ESCALATED outcome", async () => {
      const payload: RunResultPayload = {
        outcome: RunOutcome.ESCALATED,
        finalState: StateName.ESCALATE,
        statesCompleted: [StateName.INIT, StateName.OPEN_JOB_PAGE],
        errors: [
          {
            state: StateName.OPEN_JOB_PAGE,
            message: "Page classification failed with low confidence",
            timestamp: "2026-01-01T11:00:00.000Z",
          },
        ],
        artifactUrls: {},
      };

      await persistRunResult(RUN_ID, payload, mock.prisma);

      assert.equal(mock.calls[0]?.data.outcome, RunOutcome.ESCALATED);
      assert.equal(mock.calls[0]?.data.currentState, StateName.ESCALATE);
      assert.equal(mock.calls[0]?.data.confirmationId, null);
    });
  });

  // ── VERIFICATION_REQUIRED outcome ─────────────────────────────────────────

  describe("VERIFICATION_REQUIRED outcome", () => {
    it("persists correctly when Greenhouse returns a verification challenge", async () => {
      const payload: RunResultPayload = {
        outcome: RunOutcome.VERIFICATION_REQUIRED,
        finalState: StateName.SUBMIT,
        statesCompleted: [
          StateName.INIT,
          StateName.OPEN_JOB_PAGE,
          StateName.FILL_REQUIRED_FIELDS,
          StateName.ANSWER_SCREENING_QUESTIONS,
          StateName.REVIEW_DISCLOSURES,
          StateName.PRE_SUBMIT_CHECK,
          StateName.SUBMIT,
        ],
        errors: [],
        artifactUrls: {
          screenshots: {
            "SUBMIT/post-submit": "memory://run-vr-001/SUBMIT/post-submit.png",
          },
        },
      };

      await persistRunResult(RUN_ID, payload, mock.prisma);

      assert.equal(mock.calls[0]?.data.outcome, RunOutcome.VERIFICATION_REQUIRED);
      assert.equal(mock.calls[0]?.data.currentState, StateName.SUBMIT);
      assert.equal(
        mock.calls[0]?.data.confirmationId,
        null,
        "confirmationId is null — candidate must complete email verification",
      );
    });

    it("is distinct from SUBMITTED and FAILED", () => {
      assert.notEqual(RunOutcome.VERIFICATION_REQUIRED, RunOutcome.SUBMITTED);
      assert.notEqual(RunOutcome.VERIFICATION_REQUIRED, RunOutcome.FAILED);
    });

    it("produces an empty errorLogJson (form was submitted successfully)", async () => {
      const payload: RunResultPayload = {
        outcome: RunOutcome.VERIFICATION_REQUIRED,
        finalState: StateName.SUBMIT,
        statesCompleted: [StateName.INIT, StateName.SUBMIT],
        errors: [],
        artifactUrls: {},
      };

      await persistRunResult(RUN_ID, payload, mock.prisma);

      const errorLog = mock.calls[0]?.data.errorLogJson as unknown[];
      assert.deepEqual(errorLog, []);
    });

    it("all state history entries have outcome=success (no errors)", async () => {
      const payload: RunResultPayload = {
        outcome: RunOutcome.VERIFICATION_REQUIRED,
        finalState: StateName.SUBMIT,
        statesCompleted: [StateName.INIT, StateName.OPEN_JOB_PAGE, StateName.SUBMIT],
        errors: [],
        artifactUrls: {},
      };

      await persistRunResult(RUN_ID, payload, mock.prisma);

      const history = mock.calls[0]?.data.stateHistoryJson as Array<{
        outcome: string;
      }>;
      assert.ok(
        history.every((h) => h.outcome === "success"),
        "All states should be success — the application was submitted",
      );
    });
  });
});
