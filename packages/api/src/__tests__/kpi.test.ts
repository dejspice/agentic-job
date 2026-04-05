/**
 * Unit tests for buildKpiSnapshot (packages/api/src/persistence.ts)
 *
 * buildKpiSnapshot is a pure aggregation function that takes pre-fetched
 * run rows and a review count — no Prisma, no network, fully synchronous.
 *
 * Tests validate:
 *   1. Empty dataset → all zeros, formatted correctly
 *   2. Outcome counts (submitted, failed, verificationRequired)
 *   3. successRate = (submitted + verificationRequired) / total * 100
 *   4. hitlRate = runs with humanInterventions > 0 / total * 100
 *   5. avgRunDurationSec calculation
 *   6. llmCostUsd aggregation from costJson.estimatedCostUsd
 *   7. deterministicRate: runs with no LLM calls / total
 *   8. Delta computation (previous period comparison)
 *   9. reviewPendingCount passthrough
 *  10. Period and generatedAt fields
 *  11. Duration formatting (seconds vs minutes)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildKpiSnapshot } from "../persistence.js";
import type { KpiRunRow } from "../persistence.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function run(overrides: Partial<KpiRunRow> = {}): KpiRunRow {
  return {
    outcome: overrides.outcome !== undefined ? overrides.outcome : "SUBMITTED",
    humanInterventions: overrides.humanInterventions ?? 0,
    startedAt:   overrides.startedAt   ?? new Date("2026-01-01T10:00:00.000Z"),
    completedAt: overrides.completedAt !== undefined
      ? overrides.completedAt
      : new Date("2026-01-01T10:01:00.000Z"), // 60s duration
    costJson: overrides.costJson !== undefined ? overrides.costJson : {},
  };
}

// ---------------------------------------------------------------------------
// Empty dataset
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — empty dataset", () => {
  it("returns zero-value KPIs for an empty current period", () => {
    const snap = buildKpiSnapshot("7d", [], [], 0);
    assert.equal(snap.totalRuns.current, 0);
    assert.equal(snap.submittedRuns.current, 0);
    assert.equal(snap.failedRuns.current, 0);
    assert.equal(snap.verificationRequiredRuns.current, 0);
    assert.equal(snap.successRate.current, 0);
    assert.equal(snap.hitlRate.current, 0);
    assert.equal(snap.llmCostUsd.current, 0);
    assert.equal(snap.avgRunDurationSec.current, 0);
    assert.equal(snap.reviewPendingCount, 0);
  });

  it("sets period and generatedAt", () => {
    const snap = buildKpiSnapshot("24h", [], [], 0);
    assert.equal(snap.period, "24h");
    assert.ok(typeof snap.generatedAt === "string" && snap.generatedAt.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Outcome counts
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — outcome counts", () => {
  it("counts submitted runs correctly", () => {
    const current = [
      run({ outcome: "SUBMITTED" }),
      run({ outcome: "SUBMITTED" }),
      run({ outcome: "FAILED" }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.totalRuns.current, 3);
    assert.equal(snap.submittedRuns.current, 2);
    assert.equal(snap.failedRuns.current, 1);
    assert.equal(snap.verificationRequiredRuns.current, 0);
  });

  it("counts VERIFICATION_REQUIRED runs correctly", () => {
    const current = [
      run({ outcome: "SUBMITTED" }),
      run({ outcome: "VERIFICATION_REQUIRED" }),
      run({ outcome: "FAILED" }),
      run({ outcome: null }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.verificationRequiredRuns.current, 1);
    assert.equal(snap.totalRuns.current, 4);
  });

  it("counts ESCALATED/CANCELLED runs in total but not submitted/failed", () => {
    const current = [
      run({ outcome: "ESCALATED" }),
      run({ outcome: "CANCELLED" }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.totalRuns.current, 2);
    assert.equal(snap.submittedRuns.current, 0);
    assert.equal(snap.failedRuns.current, 0);
  });
});

// ---------------------------------------------------------------------------
// successRate
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — successRate", () => {
  it("counts SUBMITTED + VERIFICATION_REQUIRED as success", () => {
    const current = [
      run({ outcome: "SUBMITTED" }),
      run({ outcome: "VERIFICATION_REQUIRED" }),
      run({ outcome: "FAILED" }),
      run({ outcome: "FAILED" }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    // success = 2/4 = 50%
    assert.equal(snap.successRate.current, 50);
    assert.equal(snap.successRate.formatted, "50.0%");
  });

  it("returns 0% success when all runs failed", () => {
    const current = [run({ outcome: "FAILED" }), run({ outcome: "FAILED" })];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.successRate.current, 0);
  });
});

// ---------------------------------------------------------------------------
// hitlRate
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — hitlRate", () => {
  it("counts runs with humanInterventions > 0", () => {
    const current = [
      run({ humanInterventions: 1 }),
      run({ humanInterventions: 0 }),
      run({ humanInterventions: 2 }),
      run({ humanInterventions: 0 }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    // 2 of 4 needed human intervention = 50%
    assert.equal(snap.hitlRate.current, 50);
  });

  it("returns 0 hitlRate when no interventions", () => {
    const current = [run({ humanInterventions: 0 })];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.hitlRate.current, 0);
  });
});

// ---------------------------------------------------------------------------
// avgRunDurationSec
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — avgRunDurationSec", () => {
  it("computes average duration in seconds", () => {
    const current = [
      run({
        startedAt:   new Date("2026-01-01T10:00:00.000Z"),
        completedAt: new Date("2026-01-01T10:01:00.000Z"), // 60s
      }),
      run({
        startedAt:   new Date("2026-01-01T10:00:00.000Z"),
        completedAt: new Date("2026-01-01T10:03:00.000Z"), // 180s
      }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.avgRunDurationSec.current, 120); // (60+180)/2
  });

  it("excludes runs without completedAt from duration average", () => {
    const current = [
      run({
        startedAt:   new Date("2026-01-01T10:00:00.000Z"),
        completedAt: new Date("2026-01-01T10:01:00.000Z"), // 60s
      }),
      run({ completedAt: null }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.avgRunDurationSec.current, 60);
  });

  it("returns 0 when no runs have completedAt", () => {
    const current = [run({ completedAt: null })];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.avgRunDurationSec.current, 0);
  });
});

// ---------------------------------------------------------------------------
// llmCostUsd
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — llmCostUsd", () => {
  it("sums estimatedCostUsd from costJson across runs", () => {
    const current = [
      run({ costJson: { estimatedCostUsd: 0.12 } }),
      run({ costJson: { estimatedCostUsd: 0.08 } }),
      run({ costJson: {} }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.ok(
      Math.abs(snap.llmCostUsd.current - 0.20) < 0.0001,
      `Expected ~0.20, got ${snap.llmCostUsd.current}`,
    );
    assert.equal(snap.llmCostUsd.formatted, "$0.20");
  });

  it("returns 0 when no costJson entries", () => {
    const current = [run({ costJson: {} })];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.llmCostUsd.current, 0);
  });
});

// ---------------------------------------------------------------------------
// deterministicRate
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — deterministicRate", () => {
  it("counts runs with zero LLM calls as deterministic", () => {
    const current = [
      run({ costJson: { llmCalls: 0 } }),
      run({ costJson: {} }),             // no llmCalls key = deterministic
      run({ costJson: { llmCalls: 2 } }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    // 2 of 3 deterministic = 66.7%
    assert.ok(
      Math.abs(snap.deterministicRate.current - (200 / 3)) < 0.1,
      `Expected ~66.7, got ${snap.deterministicRate.current}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Delta computation
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — delta", () => {
  it("computes positive delta when current > previous", () => {
    const prev = [run({ outcome: "SUBMITTED" }), run({ outcome: "SUBMITTED" })]; // 2
    const curr = [run(), run(), run(), run()]; // 4
    const snap = buildKpiSnapshot("7d", curr, prev, 0);
    assert.ok((snap.totalRuns.delta ?? 0) > 0, "delta should be positive");
  });

  it("computes negative delta when current < previous", () => {
    const prev = [run(), run(), run(), run()]; // 4
    const curr = [run(), run()];               // 2
    const snap = buildKpiSnapshot("7d", curr, prev, 0);
    assert.ok((snap.totalRuns.delta ?? 0) < 0, "delta should be negative");
  });

  it("omits delta when previous is 0 (avoids divide-by-zero)", () => {
    const snap = buildKpiSnapshot("7d", [run()], [], 0);
    assert.equal(snap.totalRuns.delta, undefined);
  });

  it("sets previous field correctly", () => {
    const prev = [run()];
    const curr = [run(), run()];
    const snap = buildKpiSnapshot("7d", curr, prev, 0);
    assert.equal(snap.totalRuns.previous, 1);
    assert.equal(snap.totalRuns.current,  2);
  });
});

// ---------------------------------------------------------------------------
// reviewPendingCount passthrough
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — reviewPendingCount", () => {
  it("passes reviewPendingCount through unchanged", () => {
    const snap = buildKpiSnapshot("7d", [], [], 7);
    assert.equal(snap.reviewPendingCount, 7);
  });
});

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

describe("buildKpiSnapshot — duration formatting", () => {
  it("formats durations < 60s as seconds", () => {
    const current = [
      run({
        startedAt:   new Date("2026-01-01T10:00:00.000Z"),
        completedAt: new Date("2026-01-01T10:00:45.000Z"), // 45s
      }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.avgRunDurationSec.formatted, "45s");
  });

  it("formats durations >= 60s as minutes", () => {
    const current = [
      run({
        startedAt:   new Date("2026-01-01T10:00:00.000Z"),
        completedAt: new Date("2026-01-01T10:03:00.000Z"), // 180s = 3 min
      }),
    ];
    const snap = buildKpiSnapshot("7d", current, [], 0);
    assert.equal(snap.avgRunDurationSec.formatted, "3.0 min");
  });
});
