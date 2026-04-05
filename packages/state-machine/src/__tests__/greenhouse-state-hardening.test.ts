/**
 * Greenhouse state-handler hardening tests — unit level
 *
 * Validates the 6 hardening categories using mock execute/captureArtifact
 * functions.  No real browser or Playwright required.
 *
 * Categories tested:
 *   1. Apply entry failure captures a screenshot
 *   2. Resume upload resolves name*="resume" selector when id*="resume" absent
 *   3. Fill required fields skips optional phone when absent
 *   4. Fill required fields uses name-attribute fallback selector
 *   5. Pre-submit check excludes file inputs from the empty-required list
 *   6. Capture confirmation succeeds with .confirmation-message selector
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { StateName } from "@dejsol/core";
import type { ArtifactKind, ArtifactReference } from "@dejsol/core";

import type { StateContext, StateResult } from "../types.js";

import { detectApplyEntryState } from "../states/detect-apply-entry.js";
import { uploadResumeState } from "../states/upload-resume.js";
import { fillRequiredFieldsState } from "../states/fill-required-fields.js";
import { preSubmitCheckState } from "../states/pre-submit-check.js";
import { captureConfirmationState } from "../states/capture-confirmation.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a minimal StateContext for unit testing. */
function baseContext(
  overrides: Partial<StateContext> = {},
): StateContext {
  return {
    runId: "unit-test-run",
    jobId: "unit-test-job",
    candidateId: "unit-test-cand",
    jobUrl: "https://boards.greenhouse.io/test/jobs/1",
    currentState: StateName.INIT,
    stateHistory: [],
    data: {},
    ...overrides,
  };
}

/** Creates a captureArtifact spy that records all captured labels. */
function makeArtifactSpy(): {
  capturedLabels: string[];
  captureArtifact: StateContext["captureArtifact"];
} {
  const capturedLabels: string[] = [];
  return {
    capturedLabels,
    captureArtifact: async (
      kind: ArtifactKind,
      label: string,
    ): Promise<ArtifactReference> => {
      capturedLabels.push(label);
      return {
        kind,
        label,
        url: `memory://unit-test/${label}`,
        capturedAt: new Date().toISOString(),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Apply entry: failure captures screenshot
// ---------------------------------------------------------------------------

describe("DETECT_APPLY_ENTRY — failure path artifact capture", () => {
  it("captures a failure screenshot when no apply entry selector is found", async () => {
    const spy = makeArtifactSpy();
    const ctx = baseContext({
      captureArtifact: spy.captureArtifact,
      execute: async () => ({ success: false, durationMs: 0, error: "timeout" }),
    });

    const result = await detectApplyEntryState.execute(ctx);

    assert.equal(result.outcome, "failure");
    assert.ok(
      spy.capturedLabels.some((l) => l.includes("failure") || l.includes("not-found")),
      `Expected a failure-screenshot label, got: [${spy.capturedLabels.join(", ")}]`,
    );
  });

  it("captures a screenshot when the click fails after element is found", async () => {
    const spy = makeArtifactSpy();
    let waitForCount = 0;
    const ctx = baseContext({
      captureArtifact: spy.captureArtifact,
      execute: async (cmd) => {
        if (cmd.type === "WAIT_FOR") {
          waitForCount++;
          // First WAIT_FOR = inline form check → fail (no inline form)
          // Second WAIT_FOR = apply button check → succeed
          return waitForCount === 1
            ? { success: false, durationMs: 0 }
            : { success: true, durationMs: 0 };
        }
        // CLICK fails
        return { success: false, durationMs: 0, error: "click failed" };
      },
    });

    const result = await detectApplyEntryState.execute(ctx);

    assert.equal(result.outcome, "failure");
    assert.ok(
      spy.capturedLabels.some((l) => l.includes("failure") || l.includes("failed")),
      `Expected a failure-screenshot label, got: [${spy.capturedLabels.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Resume upload: name-based selector fallback
// ---------------------------------------------------------------------------

describe("UPLOAD_RESUME — selector priority and fallback", () => {
  it("falls back to name*=resume when id*=resume selector is not present", async () => {
    const uploadedSelectors: string[] = [];
    let waitCallCount = 0;

    const ctx = baseContext({
      data: { resumeFile: "/tmp/resume.txt" },
      execute: async (cmd) => {
        if (cmd.type === "WAIT_FOR") {
          waitCallCount++;
          const target = cmd.target as string;
          // Combined selector (any file input) succeeds; id*=resume fails; name*=resume succeeds
          if (target.includes(", ")) return { success: true, durationMs: 0 }; // combined
          if (target.includes('[id*="resume"]')) return { success: false, durationMs: 0 };
          if (target.includes('[name*="resume"]')) return { success: true, durationMs: 0 };
          return { success: false, durationMs: 0 };
        }
        if (cmd.type === "UPLOAD") {
          uploadedSelectors.push((cmd as { selector: string }).selector);
          return { success: true, durationMs: 0 };
        }
        return { success: true, durationMs: 0 };
      },
    });

    const result = await uploadResumeState.execute(ctx);

    assert.equal(result.outcome, "success", result.error);
    assert.ok(
      uploadedSelectors.some((s) => s.includes('name*="resume"') || s.includes("name*=")),
      `Expected upload to use name-based selector, got: [${uploadedSelectors.join(", ")}]`,
    );
  });

  it("falls back to generic input[type=file] when no specific selector matches", async () => {
    const uploadedSelectors: string[] = [];

    const ctx = baseContext({
      data: { resumeFile: "/tmp/resume.txt" },
      execute: async (cmd) => {
        if (cmd.type === "WAIT_FOR") {
          const target = cmd.target as string;
          // All specific selectors fail; combined and generic succeed
          if (target === 'input[type="file"]') return { success: true, durationMs: 0 };
          if (target.includes(", ")) return { success: true, durationMs: 0 };
          return { success: false, durationMs: 0 };
        }
        if (cmd.type === "UPLOAD") {
          uploadedSelectors.push((cmd as { selector: string }).selector);
          return { success: true, durationMs: 0 };
        }
        return { success: true, durationMs: 0 };
      },
    });

    const result = await uploadResumeState.execute(ctx);

    assert.equal(result.outcome, "success", result.error);
    assert.ok(
      uploadedSelectors.length > 0,
      "Expected at least one upload attempt",
    );
  });

  it("captures a failure screenshot when resume input is not found", async () => {
    const spy = makeArtifactSpy();
    const ctx = baseContext({
      data: { resumeFile: "/tmp/resume.txt" },
      captureArtifact: spy.captureArtifact,
      execute: async () => ({ success: false, durationMs: 0, error: "timeout" }),
    });

    const result = await uploadResumeState.execute(ctx);

    assert.equal(result.outcome, "failure");
    assert.ok(
      spy.capturedLabels.some((l) => l.includes("not-found") || l.includes("failure")),
      `Expected failure screenshot, got: [${spy.capturedLabels.join(", ")}]`,
    );
  });

  it("captures a failure screenshot when upload fails after input found", async () => {
    const spy = makeArtifactSpy();
    const ctx = baseContext({
      data: { resumeFile: "/tmp/resume.txt" },
      captureArtifact: spy.captureArtifact,
      execute: async (cmd) => {
        if (cmd.type === "WAIT_FOR") return { success: true, durationMs: 0 };
        if (cmd.type === "UPLOAD") return { success: false, durationMs: 0, error: "upload failed" };
        return { success: true, durationMs: 0 };
      },
    });

    const result = await uploadResumeState.execute(ctx);

    assert.equal(result.outcome, "failure");
    assert.ok(
      spy.capturedLabels.some((l) => l.includes("failed") || l.includes("failure")),
      `Expected failure screenshot, got: [${spy.capturedLabels.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Fill required fields: optional phone skipped when absent
// ---------------------------------------------------------------------------

describe("FILL_REQUIRED_FIELDS — optional field handling", () => {
  it("succeeds when phone is absent but name+email are present", async () => {
    const typeCallCount: string[] = [];

    const ctx = baseContext({
      data: {
        candidate: {
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@test.com",
          // phone intentionally omitted — optional
        },
      },
      execute: async (cmd) => {
        if (cmd.type === "WAIT_FOR") return { success: true, durationMs: 0 };
        if (cmd.type === "TYPE") {
          typeCallCount.push((cmd as { selector: string }).selector);
          return { success: true, durationMs: 0 };
        }
        return { success: true, durationMs: 0 };
      },
    });

    const result = await fillRequiredFieldsState.execute(ctx);

    assert.equal(result.outcome, "success", result.error);
    // firstName, lastName, email filled; phone skipped
    assert.equal(
      (result.data?.filledFields as string[] | undefined)?.length ?? 0,
      3,
      "Expected 3 fields filled (firstName, lastName, email)",
    );
  });

  it("fails when a required field (email) is absent from candidate data", async () => {
    const ctx = baseContext({
      data: {
        candidate: {
          firstName: "Jane",
          lastName: "Doe",
          // email intentionally omitted — required
        },
      },
      execute: async (cmd) => {
        if (cmd.type === "WAIT_FOR") return { success: true, durationMs: 0 };
        if (cmd.type === "TYPE") return { success: true, durationMs: 0 };
        return { success: true, durationMs: 0 };
      },
    });

    const result = await fillRequiredFieldsState.execute(ctx);

    assert.equal(result.outcome, "failure");
    assert.ok(
      result.error?.includes("email") ?? false,
      `Expected failure message about email, got: "${result.error}"`,
    );
  });

  it("captures a failure screenshot when required fields cannot be filled", async () => {
    const spy = makeArtifactSpy();

    const ctx = baseContext({
      data: {
        candidate: {
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@test.com",
        },
      },
      captureArtifact: spy.captureArtifact,
      execute: async (cmd) => {
        // All WAIT_FOR fail → no selectors can be filled → required fields fail
        if (cmd.type === "WAIT_FOR") return { success: false, durationMs: 0 };
        return { success: true, durationMs: 0 };
      },
    });

    const result = await fillRequiredFieldsState.execute(ctx);

    assert.equal(result.outcome, "failure");
    assert.ok(
      spy.capturedLabels.some((l) => l.includes("failure")),
      `Expected failure screenshot, got: [${spy.capturedLabels.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Fill fields: name-attribute fallback selector
// ---------------------------------------------------------------------------

describe("FILL_REQUIRED_FIELDS — selector fallback", () => {
  it("uses name-attribute selector when id-based selector is not found", async () => {
    const typeSelectors: string[] = [];

    const ctx = baseContext({
      data: {
        candidate: {
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@test.com",
          phone: "555-1234",
        },
      },
      execute: async (cmd) => {
        if (cmd.type === "WAIT_FOR") {
          const target = cmd.target as string;
          // ID-based selectors fail; name-based succeed
          if (target.startsWith("#")) return { success: false, durationMs: 0 };
          return { success: true, durationMs: 0 };
        }
        if (cmd.type === "TYPE") {
          typeSelectors.push((cmd as { selector: string }).selector);
          return { success: true, durationMs: 0 };
        }
        return { success: true, durationMs: 0 };
      },
    });

    const result = await fillRequiredFieldsState.execute(ctx);

    assert.equal(result.outcome, "success", result.error);
    // All 4 fields should be filled via name-based selectors
    assert.ok(
      typeSelectors.every((s) => !s.startsWith("#")),
      `Expected name-based selectors to be used, got: [${typeSelectors.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Pre-submit check: file inputs excluded from empty-required check
// ---------------------------------------------------------------------------

describe("PRE_SUBMIT_CHECK — file input exclusion", () => {
  it("passes when a required file input has empty value (post-upload headless behaviour)", async () => {
    const ctx = baseContext({
      execute: async (cmd) => {
        if (cmd.type === "EXTRACT_FIELDS") {
          return {
            success: true,
            durationMs: 0,
            data: {
              fields: [
                { selector: "#first_name", type: "text", required: true, value: "Jane" },
                { selector: "#email", type: "email", required: true, value: "jane@test.com" },
                // File input: required=true but value=null — mimics headless browser behaviour
                { selector: "#resume", type: "file", required: true, value: null },
              ],
              count: 3,
            },
          };
        }
        return { success: true, durationMs: 0 };
      },
    });

    const result = await preSubmitCheckState.execute(ctx);

    assert.equal(
      result.outcome,
      "success",
      "Should pass even though the file input has no .value in headless mode",
    );
  });

  it("fails when a required non-file field is empty", async () => {
    const ctx = baseContext({
      execute: async (cmd) => {
        if (cmd.type === "EXTRACT_FIELDS") {
          return {
            success: true,
            durationMs: 0,
            data: {
              fields: [
                { selector: "#first_name", type: "text", required: true, value: null },
                { selector: "#email", type: "email", required: true, value: "jane@test.com" },
                { selector: "#resume", type: "file", required: true, value: null },
              ],
              count: 3,
            },
          };
        }
        return { success: true, durationMs: 0 };
      },
    });

    const result = await preSubmitCheckState.execute(ctx);

    assert.equal(result.outcome, "failure");
    assert.ok(
      result.error?.includes("#first_name") ?? false,
      `Expected failure for #first_name, got: "${result.error}"`,
    );
  });

  it("passes when EXTRACT_FIELDS is unavailable (graceful degradation)", async () => {
    const ctx = baseContext({
      execute: async () => ({ success: false, durationMs: 0, error: "not available" }),
    });

    const result = await preSubmitCheckState.execute(ctx);

    assert.equal(result.outcome, "success");
  });
});

// ---------------------------------------------------------------------------
// 6. Capture confirmation: alternate selector (.confirmation-message)
// ---------------------------------------------------------------------------

describe("CAPTURE_CONFIRMATION — alternate confirmation selectors", () => {
  it("returns success and captures confirmation text via .confirmation-message", async () => {
    const ctx = baseContext({
      execute: async (cmd) => {
        if (cmd.type === "READ_TEXT") {
          return {
            success: true,
            durationMs: 0,
            data: { text: "Thank you for your application. Reference: GH-2026-00073" },
          };
        }
        return { success: true, durationMs: 0 };
      },
    });

    const result = await captureConfirmationState.execute(ctx);

    assert.equal(result.outcome, "success");
    assert.ok(
      (result.data?.confirmationText as string | undefined)?.includes("Thank you"),
      `Expected confirmation text, got: "${result.data?.confirmationText}"`,
    );
    assert.equal(result.data?.runOutcome, "SUBMITTED");
  });

  it("still returns SUBMITTED when READ_TEXT fails (screenshot is the proof)", async () => {
    const ctx = baseContext({
      execute: async () => ({ success: false, durationMs: 0, error: "strict mode" }),
    });

    const result = await captureConfirmationState.execute(ctx);

    assert.equal(result.outcome, "success");
    assert.equal(result.data?.runOutcome, "SUBMITTED");
    assert.ok(
      (result.data?.confirmationText as string | undefined)?.includes("screenshot"),
      `Expected fallback confirmation text, got: "${result.data?.confirmationText}"`,
    );
  });
});
