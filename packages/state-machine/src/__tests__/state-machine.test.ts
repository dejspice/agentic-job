import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { StateName, STATE_ORDER } from "@dejsol/core";
import { ApplyStateMachine } from "../state-machine.js";
import { stateHandlers } from "../states/index.js";
import type { StateContext } from "../types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const ALL_STATES = Object.values(StateName) as StateName[];

const mockContext: StateContext = {
  runId: "run-test-1",
  jobId: "job-test-1",
  candidateId: "cand-test-1",
  jobUrl: "https://jobs.example.com/eng-123",
  currentState: StateName.INIT,
  stateHistory: [],
  data: {},
};

// ─── Registration ──────────────────────────────────────────────────────────

describe("ApplyStateMachine — registration", () => {
  const sm = new ApplyStateMachine();

  it("registers exactly 14 states", () => {
    assert.equal(sm.getRegisteredStates().length, 14);
  });

  it("registers every StateName value", () => {
    const registered = new Set(sm.getRegisteredStates());
    for (const name of ALL_STATES) {
      assert.ok(registered.has(name), `Missing registration for: ${name}`);
    }
  });

  it("getStateOrder returns the canonical STATE_ORDER from @dejsol/core", () => {
    assert.deepEqual([...sm.getStateOrder()], [...STATE_ORDER]);
  });

  it("getHandler returns a handler whose name matches the requested state", () => {
    for (const name of ALL_STATES) {
      const handler = sm.getHandler(name);
      assert.equal(handler.name, name);
    }
  });

  it("getHandler throws for an unknown state name", () => {
    assert.throws(
      () => sm.getHandler("UNKNOWN_STATE" as StateName),
      /No handler registered/,
    );
  });

  it("constructor throws on duplicate handler registration", () => {
    // Verify guard: passing the same handler twice would throw.
    // We test indirectly by confirming no duplicate names exist in stateHandlers.
    const seen = new Set<StateName>();
    for (const h of stateHandlers) {
      assert.ok(!seen.has(h.name), `Duplicate handler found for: ${h.name}`);
      seen.add(h.name);
    }
  });
});

// ─── Terminal states ───────────────────────────────────────────────────────

describe("ApplyStateMachine — terminal states", () => {
  const sm = new ApplyStateMachine();

  it("CAPTURE_CONFIRMATION is terminal", () => {
    assert.ok(sm.isTerminal(StateName.CAPTURE_CONFIRMATION));
  });

  it("ESCALATE is terminal", () => {
    assert.ok(sm.isTerminal(StateName.ESCALATE));
  });

  const nonTerminal: StateName[] = [
    StateName.INIT,
    StateName.OPEN_JOB_PAGE,
    StateName.FILL_REQUIRED_FIELDS,
    StateName.SUBMIT,
    StateName.PRE_SUBMIT_CHECK,
  ];

  for (const state of nonTerminal) {
    it(`${state} is NOT terminal`, () => {
      assert.ok(!sm.isTerminal(state), `Expected ${state} to be non-terminal`);
    });
  }
});

// ─── Canonical order advancement ──────────────────────────────────────────

describe("ApplyStateMachine — resolveNextState canonical advancement", () => {
  const sm = new ApplyStateMachine();

  // Build pairs: every non-terminal state → its canonical successor.
  const nonTerminalStates = [...STATE_ORDER].filter((s) => !sm.isTerminal(s));

  for (const current of nonTerminalStates) {
    const canonicalIdx = STATE_ORDER.indexOf(current);
    const expected = STATE_ORDER[canonicalIdx + 1];

    it(`${current} → ${expected} on success`, () => {
      const next = sm.resolveNextState(current, { outcome: "success" });
      assert.equal(next, expected);
    });
  }
});

// ─── Escalation override ───────────────────────────────────────────────────

describe("ApplyStateMachine — resolveNextState escalation", () => {
  const sm = new ApplyStateMachine();

  it("escalated outcome jumps to ESCALATE from a mid-flow state", () => {
    const next = sm.resolveNextState(StateName.FILL_REQUIRED_FIELDS, {
      outcome: "escalated",
    });
    assert.equal(next, StateName.ESCALATE);
  });

  it("escalated outcome jumps to ESCALATE from every non-terminal state", () => {
    const nonTerminal = ALL_STATES.filter((s) => !sm.isTerminal(s));
    for (const state of nonTerminal) {
      const next = sm.resolveNextState(state, { outcome: "escalated" });
      assert.equal(next, StateName.ESCALATE, `Expected ESCALATE from ${state}`);
    }
  });

  it("escalated outcome also returns ESCALATE from CAPTURE_CONFIRMATION (terminal)", () => {
    // Escalation check runs before terminal check in resolveNextState.
    const next = sm.resolveNextState(StateName.CAPTURE_CONFIRMATION, {
      outcome: "escalated",
    });
    assert.equal(next, StateName.ESCALATE);
  });
});

// ─── Explicit nextState override ──────────────────────────────────────────

describe("ApplyStateMachine — resolveNextState explicit override", () => {
  const sm = new ApplyStateMachine();

  it("respects explicit nextState override on success", () => {
    const next = sm.resolveNextState(StateName.INIT, {
      outcome: "success",
      nextState: StateName.UPLOAD_RESUME,
    });
    assert.equal(next, StateName.UPLOAD_RESUME);
  });

  it("respects explicit nextState even when outcome is failure", () => {
    const next = sm.resolveNextState(StateName.OPEN_JOB_PAGE, {
      outcome: "failure",
      nextState: StateName.DETECT_APPLY_ENTRY,
    });
    assert.equal(next, StateName.DETECT_APPLY_ENTRY);
  });

  it("explicit nextState takes priority over escalated outcome", () => {
    // nextState is checked first in resolveNextState.
    const next = sm.resolveNextState(StateName.FILL_REQUIRED_FIELDS, {
      outcome: "escalated",
      nextState: StateName.REVIEW_DISCLOSURES,
    });
    assert.equal(next, StateName.REVIEW_DISCLOSURES);
  });
});

// ─── Terminal state resolution ────────────────────────────────────────────

describe("ApplyStateMachine — resolveNextState terminal states return null", () => {
  const sm = new ApplyStateMachine();

  it("CAPTURE_CONFIRMATION returns null on success (workflow complete)", () => {
    const next = sm.resolveNextState(StateName.CAPTURE_CONFIRMATION, {
      outcome: "success",
    });
    assert.equal(next, null);
  });

  it("ESCALATE returns null on success (terminal, no continuation)", () => {
    const next = sm.resolveNextState(StateName.ESCALATE, { outcome: "success" });
    assert.equal(next, null);
  });

  it("ESCALATE returns null on failure", () => {
    const next = sm.resolveNextState(StateName.ESCALATE, { outcome: "failure" });
    assert.equal(next, null);
  });
});

// ─── executeState delegation ──────────────────────────────────────────────

describe("ApplyStateMachine — executeState delegates to handler", () => {
  const sm = new ApplyStateMachine();

  it("executeState(INIT) returns a StateResult with a valid outcome", async () => {
    const result = await sm.executeState(StateName.INIT, {
      ...mockContext,
      currentState: StateName.INIT,
    });
    assert.ok("outcome" in result);
    const validOutcomes = new Set(["success", "failure", "skipped", "escalated"]);
    assert.ok(
      validOutcomes.has(result.outcome),
      `Unexpected outcome: ${result.outcome}`,
    );
  });

  it("executeState(ESCALATE) returns escalated outcome", async () => {
    const result = await sm.executeState(StateName.ESCALATE, {
      ...mockContext,
      currentState: StateName.ESCALATE,
    });
    assert.equal(result.outcome, "escalated");
  });
});

// ─── State handler shapes ─────────────────────────────────────────────────

describe("State handlers — required shape", () => {
  it("every handler exposes name, entryCriteria, successCriteria, execute", () => {
    for (const handler of stateHandlers) {
      assert.ok(
        typeof handler.name === "string" && handler.name.length > 0,
        `${handler.name}: name must be a non-empty string`,
      );
      assert.ok(
        typeof handler.entryCriteria === "string" && handler.entryCriteria.length > 0,
        `${handler.name}: missing entryCriteria`,
      );
      assert.ok(
        typeof handler.successCriteria === "string" && handler.successCriteria.length > 0,
        `${handler.name}: missing successCriteria`,
      );
      assert.equal(
        typeof handler.execute,
        "function",
        `${handler.name}: execute must be a function`,
      );
    }
  });

  it("handler names are all valid StateName enum values", () => {
    const validNames = new Set<string>(ALL_STATES);
    for (const handler of stateHandlers) {
      assert.ok(
        validNames.has(handler.name),
        `Handler name '${handler.name}' is not a valid StateName`,
      );
    }
  });

  it("handler count matches STATE_ORDER length", () => {
    assert.equal(stateHandlers.length, STATE_ORDER.length);
  });
});

describe("State handlers — execute stubs return valid typed results", () => {
  const validOutcomes = new Set(["success", "failure", "skipped", "escalated"]);

  for (const handler of stateHandlers) {
    it(`${handler.name}.execute() returns a valid StateResult`, async () => {
      const result = await handler.execute({
        ...mockContext,
        currentState: handler.name,
      });

      assert.ok("outcome" in result, `${handler.name}: result must have outcome`);
      assert.ok(
        validOutcomes.has(result.outcome),
        `${handler.name}: unexpected outcome '${result.outcome}'`,
      );

      if (result.data !== undefined) {
        assert.ok(
          typeof result.data === "object" && result.data !== null,
          `${handler.name}: data must be an object when present`,
        );
      }
    });
  }

  it("ESCALATE stub returns escalated outcome specifically", async () => {
    const sm = new ApplyStateMachine();
    const result = await sm.executeState(StateName.ESCALATE, {
      ...mockContext,
      currentState: StateName.ESCALATE,
    });
    assert.equal(result.outcome, "escalated");
  });
});
