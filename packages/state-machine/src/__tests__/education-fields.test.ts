/**
 * Tests for education field handling in fill-required-fields.ts.
 *
 * Covers:
 *   1. School uses location-autocomplete interaction (async suggestion)
 *   2. Degree/discipline use react-select interaction
 *   3. Year fields use plain text TYPE
 *   4. Month fields try text first then numeric fallback via SELECT
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fillRequiredFieldsState } from "../states/fill-required-fields.js";
import type { StateContext } from "../types.js";
import { StateName } from "@dejsol/core";
import type { WorkerCommand, CommandResult } from "@dejsol/core";

function makeEduContext(
  presentSelectors: Set<string>,
  candidateOverrides: Record<string, string> = {},
): { ctx: StateContext; commands: WorkerCommand[] } {
  const commands: WorkerCommand[] = [];

  const ctx: StateContext = {
    runId: "test-run",
    jobId: "test-job",
    candidateId: "test-cand",
    jobUrl: "https://example.com",
    currentState: StateName.FILL_REQUIRED_FIELDS,
    stateHistory: [],
    data: {
      candidate: {
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        school: "MIT",
        degree: "Bachelor's",
        discipline: "Computer Science",
        eduStartYear: "2016",
        eduEndYear: "2020",
        eduStartMonth: "August",
        eduEndMonth: "May",
        ...candidateOverrides,
      },
    },
    execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
      commands.push(cmd);

      if (cmd.type === "WAIT_FOR") {
        const target = typeof cmd.target === "string" ? cmd.target : "";
        if (presentSelectors.has(target)) return { success: true, durationMs: 0 };
        if (target.includes("option")) return { success: true, durationMs: 0 };
        return { success: false, durationMs: 0 };
      }
      if (cmd.type === "TYPE") return { success: true, durationMs: 0 };
      if (cmd.type === "CLICK") return { success: true, durationMs: 0 };
      if (cmd.type === "SELECT") return { success: true, durationMs: 0 };
      return { success: true, durationMs: 0 };
    },
  };

  return { ctx, commands };
}

describe("education fields — interaction types", () => {
  it("school uses sequential TYPE (location-autocomplete pattern)", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#school--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const schoolType = commands.find(
      c => c.type === "TYPE" && "selector" in c && (c as { selector: string }).selector === "#school--0" && "sequential" in c && (c as { sequential?: boolean }).sequential,
    );
    assert.ok(schoolType, "School should use sequential TYPE (autocomplete pattern)");
  });

  it("degree uses sequential TYPE (react-select pattern)", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#degree--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const degreeType = commands.find(
      c => c.type === "TYPE" && "selector" in c && (c as { selector: string }).selector === "#degree--0" && "sequential" in c,
    );
    assert.ok(degreeType, "Degree should use sequential TYPE (react-select pattern)");
  });

  it("year fields use plain TYPE with clearFirst", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#start-year--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const yearType = commands.find(
      c => c.type === "TYPE" && "selector" in c && (c as { selector: string }).selector === "#start-year--0" && "clearFirst" in c,
    );
    assert.ok(yearType, "Year should use plain TYPE with clearFirst");
  });

  it("month fields use SELECT command", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#start-month--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const selectCmd = commands.find(
      c => c.type === "SELECT" && "selector" in c && (c as { selector: string }).selector === "#start-month--0",
    );
    assert.ok(selectCmd, "Month should use SELECT command");
  });
});

describe("education fields — month numeric fallback", () => {
  it("tries numeric month value when text fails", async () => {
    const selectAttempts: string[] = [];

    const ctx: StateContext = {
      runId: "test-run",
      jobId: "test-job",
      candidateId: "test-cand",
      jobUrl: "https://example.com",
      currentState: StateName.FILL_REQUIRED_FIELDS,
      stateHistory: [],
      data: {
        candidate: {
          firstName: "Test", lastName: "User", email: "test@example.com",
          eduStartMonth: "August",
        },
      },
      execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
        if (cmd.type === "WAIT_FOR") {
          const target = typeof cmd.target === "string" ? cmd.target : "";
          if (target === "#start-month--0") return { success: true, durationMs: 0 };
          if (target === "#first_name" || target === "#last_name" || target === "#email") return { success: true, durationMs: 0 };
          return { success: false, durationMs: 0 };
        }
        if (cmd.type === "SELECT") {
          const val = (cmd as { value: string }).value;
          selectAttempts.push(val);
          return { success: val === "8", durationMs: 0 };
        }
        if (cmd.type === "TYPE") return { success: true, durationMs: 0 };
        return { success: true, durationMs: 0 };
      },
    };

    await fillRequiredFieldsState.execute(ctx);

    assert.ok(selectAttempts.includes("August"), "Should try text 'August' first");
    assert.ok(selectAttempts.includes("8"), "Should try numeric '8' as fallback");
  });
});
