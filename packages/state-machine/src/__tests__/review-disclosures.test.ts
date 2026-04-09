/**
 * Tests for review-disclosures.ts — EEO field filling.
 *
 * Covers:
 *   1. Standard Greenhouse EEO fields are filled when present
 *   2. Missing EEO fields are skipped
 *   3. EEO values resolved from candidate data bag
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { reviewDisclosuresState } from "../states/review-disclosures.js";
import type { StateContext } from "../types.js";
import { StateName } from "@dejsol/core";
import type { WorkerCommand, CommandResult } from "@dejsol/core";

function makeContext(
  presentSelectors: Set<string>,
  candidateOverrides: Record<string, string> = {},
): StateContext {
  const commands: WorkerCommand[] = [];
  const filledSelectors: string[] = [];

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
        disabilityStatus: "No, I do not have a disability and have not had one in the past",
        ...candidateOverrides,
      },
    },
    execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
      commands.push(cmd);
      if (cmd.type === "WAIT_FOR") {
        const target = typeof cmd.target === "string" ? cmd.target : "";
        if (target === "#__rsd_settle_never_exists__") return { success: false, durationMs: 0 };
        return { success: presentSelectors.has(target), durationMs: 0 };
      }
      if (cmd.type === "TYPE" && "selector" in cmd) {
        filledSelectors.push((cmd as { selector: string }).selector);
        return { success: true, durationMs: 0 };
      }
      if (cmd.type === "EXTRACT_OPTIONS") {
        return { success: true, durationMs: 0, data: { options: ["Yes", "No", "Decline"] } };
      }
      if (cmd.type === "EXTRACT_FIELDS") {
        return { success: true, durationMs: 0, data: { fields: [] } };
      }
      if (cmd.type === "CLICK") return { success: true, durationMs: 0 };
      if (cmd.type === "CHECK") return { success: true, durationMs: 0 };
      return { success: true, durationMs: 0 };
    },
  };
}

describe("reviewDisclosuresState — standard EEO fields", () => {
  it("fills all 4 EEO fields when present on the page", async () => {
    const present = new Set([
      "#gender",
      "#hispanic_ethnicity",
      "#veteran_status",
      "#disability_status",
      "[id*='-option-']",
    ]);
    const ctx = makeContext(present);
    const result = await reviewDisclosuresState.execute(ctx);

    assert.equal(result.outcome, "success");
    const filled = (result.data as Record<string, unknown>)?.disclosuresFilled as string[];
    assert.ok(filled.length === 4, `Expected 4 filled, got ${filled.length}: ${filled.join(", ")}`);
  });

  it("skips EEO fields that are not present on the page", async () => {
    const present = new Set<string>();
    const ctx = makeContext(present);
    const result = await reviewDisclosuresState.execute(ctx);

    assert.equal(result.outcome, "success");
    const filled = (result.data as Record<string, unknown>)?.disclosuresFilled as string[];
    const skipped = (result.data as Record<string, unknown>)?.disclosuresSkipped as string[];
    assert.equal(filled.length, 0);
    assert.ok(skipped.length >= 4, "All 4 standard EEO fields should be skipped");
  });

  it("fills only present EEO fields, skips missing ones", async () => {
    const present = new Set(["#gender", "[id*='-option-']"]);
    const ctx = makeContext(present);
    const result = await reviewDisclosuresState.execute(ctx);

    const filled = (result.data as Record<string, unknown>)?.disclosuresFilled as string[];
    const skipped = (result.data as Record<string, unknown>)?.disclosuresSkipped as string[];
    assert.ok(filled.includes("Gender"), `Gender should be filled, got: ${filled.join(", ")}`);
    assert.ok(skipped.includes("Veteran Status"), "Veteran Status should be skipped");
  });

  it("resolves values from candidate data bag", async () => {
    const commands: WorkerCommand[] = [];
    const present = new Set(["#gender", "[id*='-option-']"]);
    const ctx: StateContext = {
      ...makeContext(present, { gender: "Non-binary" }),
      execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
        commands.push(cmd);
        if (cmd.type === "WAIT_FOR") {
          const target = typeof cmd.target === "string" ? cmd.target : "";
          if (target === "#__rsd_settle_never_exists__") return { success: false, durationMs: 0 };
          return { success: present.has(target), durationMs: 0 };
        }
        if (cmd.type === "TYPE") return { success: true, durationMs: 0 };
        if (cmd.type === "EXTRACT_OPTIONS") return { success: true, durationMs: 0, data: { options: ["Male", "Female", "Non-binary"] } };
        if (cmd.type === "EXTRACT_FIELDS") return { success: true, durationMs: 0, data: { fields: [] } };
        if (cmd.type === "CLICK") return { success: true, durationMs: 0 };
        return { success: true, durationMs: 0 };
      },
    };
    await reviewDisclosuresState.execute(ctx);

    const typeCmd = commands.find(c => c.type === "TYPE" && "selector" in c && (c as { selector: string }).selector === "#gender");
    assert.ok(typeCmd, "Should TYPE into #gender");
  });
});
