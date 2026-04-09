/**
 * Tests for review-disclosures.ts — EEO field routing.
 *
 * Standard EEO fields (#gender, #race, etc.) are now routed through
 * ANSWER_SCREENING_QUESTIONS via the selector allowlist. REVIEW_DISCLOSURES
 * skips them and only handles custom EEO (numeric-ID) and checkboxes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { reviewDisclosuresState } from "../states/review-disclosures.js";
import type { StateContext } from "../types.js";
import { StateName } from "@dejsol/core";
import type { WorkerCommand, CommandResult } from "@dejsol/core";

function makeContext(): StateContext {
  return {
    runId: "test-run",
    jobId: "test-job",
    candidateId: "test-cand",
    jobUrl: "https://example.com",
    currentState: StateName.REVIEW_DISCLOSURES,
    stateHistory: [],
    data: {
      candidate: {
        gender: "Cisgender man",
        hispanicLatino: "No",
        veteranStatus: "I have never served in the military",
        disabilityStatus: "No, I do not have a disability",
        raceEthnicity: "South Asian",
      },
    },
    execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
      if (cmd.type === "EXTRACT_FIELDS") {
        return { success: true, durationMs: 0, data: { fields: [] } };
      }
      if (cmd.type === "CHECK") return { success: true, durationMs: 0 };
      return { success: false, durationMs: 0 };
    },
  };
}

describe("reviewDisclosuresState — standard EEO routing", () => {
  it("skips standard EEO fields (handled by screening state now)", async () => {
    const ctx = makeContext();
    const result = await reviewDisclosuresState.execute(ctx);

    assert.equal(result.outcome, "success");
    const skipped = (result.data as Record<string, unknown>)?.disclosuresSkipped as string[];
    assert.ok(skipped.length >= 5, `Expected 5+ skipped standard EEO, got ${skipped.length}: ${skipped.join(", ")}`);
    assert.ok(skipped.includes("Gender"));
    assert.ok(skipped.includes("Race / Ethnicity"));
    assert.ok(skipped.includes("Veteran Status"));
  });

  it("reports zero filled for standard EEO (screening handles them)", async () => {
    const ctx = makeContext();
    const result = await reviewDisclosuresState.execute(ctx);

    const filled = (result.data as Record<string, unknown>)?.disclosuresFilled as string[];
    assert.equal(filled.length, 0);
  });
});
