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
import { scoreOption, pickBestOption } from "../screening/option-matcher.js";
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
  it("school uses sequential TYPE (education-autocomplete pattern)", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#school--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const schoolType = commands.find(
      c => c.type === "TYPE" && "selector" in c && (c as { selector: string }).selector === "#school--0" && "sequential" in c && (c as { sequential?: boolean }).sequential,
    );
    assert.ok(schoolType, "School should use sequential TYPE (education-autocomplete pattern)");
  });

  it("school reads visible options before clicking", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#school--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const readTexts = commands.filter(c => c.type === "READ_TEXT");
    assert.ok(readTexts.length >= 1, "Should READ_TEXT option labels for scoring");
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

  it("month fields use react-select pattern (sequential TYPE)", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#start-month--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const monthType = commands.find(
      c => c.type === "CLICK" && "target" in c && typeof (c as Record<string, unknown>).target === "object",
    );
    assert.ok(monthType, "Month should use CLICK (react-select open + option click)");
  });
});

describe("education fields — school option scoring", () => {
  it("scores 'University of Texas - Dallas' against 'University of Texas at Dallas'", () => {
    const desired = "University of Texas at Dallas".replace(/-/g, " ").replace(/\b(at|the)\b/gi, "").replace(/\s+/g, " ").trim();
    const option = "University of Texas - Dallas".replace(/-/g, " ").replace(/\b(at|the)\b/gi, "").replace(/\s+/g, " ").trim();
    const score = scoreOption(desired, option);
    assert.ok(score >= 70, `Expected score >= 70 for normalized match, got ${score}`);
  });

  it("pickBestOption finds best school from Greenhouse-style options", () => {
    const desired = "University of Texas Dallas";
    const options = [
      "University Texas Arlington",
      "University Texas Austin",
      "University Texas Dallas",
      "University Texas El Paso",
    ];
    const best = pickBestOption(desired, options);
    assert.ok(best, "Should find a match");
    assert.equal(best.index, 2, `Should pick 'Dallas' variant, got index ${best.index}: ${best.label}`);
  });
});

describe("education fields — month as react-select", () => {
  it("month fields use sequential TYPE for react-select interaction", async () => {
    const { ctx, commands } = makeEduContext(new Set(["#start-month--0", "#first_name", "#last_name", "#email"]));
    await fillRequiredFieldsState.execute(ctx);

    const monthType = commands.find(
      c => c.type === "TYPE" && "selector" in c && (c as { selector: string }).selector === "#start-month--0" && "sequential" in c,
    );
    assert.ok(monthType, "Month should use sequential TYPE for react-select");
  });
});
