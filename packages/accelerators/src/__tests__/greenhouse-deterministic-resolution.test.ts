/**
 * Integration test: Week 4 Step 18
 *
 * Proves that known Greenhouse field labels are resolved deterministically
 * through pattern matching WITHOUT invoking the fallback model provider.
 *
 * What this test verifies:
 *   1. A known Greenhouse field label is presented to the field classifier.
 *   2. The deterministic pattern matcher resolves it to the correct normalizedKey
 *      and candidatePath.
 *   3. The model/provider fallback is never called.
 *   4. The result shape is correct and usable downstream.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createFieldClassifier,
  precheckFieldClassification,
  type FieldClassifierInput,
  type ModelProvider,
  type ModelRequest,
  type LlmResult,
} from "@dejsol/intelligence";

// ─── Spy ModelProvider ────────────────────────────────────────────────────────

/**
 * A fake ModelProvider that records every call made to it.
 * Any invocation is treated as a test failure because known Greenhouse fields
 * must never reach the fallback path.
 */
function makeSpyProvider(): ModelProvider & { callCount: number } {
  return {
    callCount: 0,
    async complete<T>(_request: ModelRequest): Promise<LlmResult<T>> {
      this.callCount++;
      throw new Error(
        "ModelProvider.complete() must NOT be called for known Greenhouse fields",
      );
    },
  };
}

// ─── Test table ───────────────────────────────────────────────────────────────

interface FieldCase {
  /** Exact label as it appears on the Greenhouse form */
  label: string;
  inputType: string;
  /** Expected normalizedKey from the pattern matcher */
  expectedKey: string;
  /** Expected source — must always be deterministic for known fields */
  expectedSource: "pattern_matcher" | "portal_fingerprint";
}

/**
 * Representative Greenhouse field labels drawn directly from the Greenhouse
 * form schema (packages/accelerators/src/greenhouse/schema.ts).
 */
const KNOWN_GREENHOUSE_FIELDS: FieldCase[] = [
  {
    label: "First Name",
    inputType: "text",
    expectedKey: "first_name",
    expectedSource: "pattern_matcher",
  },
  {
    label: "Last Name",
    inputType: "text",
    expectedKey: "last_name",
    expectedSource: "pattern_matcher",
  },
  {
    label: "Email",
    inputType: "email",
    expectedKey: "email",
    expectedSource: "pattern_matcher",
  },
  {
    label: "Phone",
    inputType: "tel",
    expectedKey: "phone",
    expectedSource: "pattern_matcher",
  },
  {
    label: "LinkedIn Profile",
    inputType: "text",
    expectedKey: "linkedin_url",
    expectedSource: "pattern_matcher",
  },
  {
    label: "Resume/CV",
    inputType: "file",
    expectedKey: "resume",
    expectedSource: "pattern_matcher",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(c: FieldCase): FieldClassifierInput {
  return {
    label: c.label,
    selector: `#${c.expectedKey}`,
    inputType: c.inputType,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Greenhouse deterministic field resolution — integration", () => {
  describe("precheckFieldClassification — synchronous deterministic layer", () => {
    for (const fieldCase of KNOWN_GREENHOUSE_FIELDS) {
      it(`precheck resolves "${fieldCase.label}" deterministically`, () => {
        const input = makeInput(fieldCase);
        const result = precheckFieldClassification(input);

        assert.equal(
          result.hit,
          true,
          `Expected deterministic hit for label "${fieldCase.label}"`,
        );
        assert.ok(
          result.value,
          `Expected a value in the precheck result for "${fieldCase.label}"`,
        );
        assert.equal(
          result.value!.normalizedKey,
          fieldCase.expectedKey,
          `normalizedKey mismatch for "${fieldCase.label}"`,
        );
        assert.equal(
          result.value!.source,
          fieldCase.expectedSource,
          `source must be "${fieldCase.expectedSource}" for "${fieldCase.label}", got "${result.value!.source}"`,
        );
        assert.ok(
          result.value!.confidence > 0,
          `confidence must be positive for "${fieldCase.label}"`,
        );
      });
    }
  });

  describe("createFieldClassifier — deterministic-first service", () => {
    it("resolves all known Greenhouse labels without calling the model provider", async () => {
      const spy = makeSpyProvider();
      const classifier = createFieldClassifier(spy);

      for (const fieldCase of KNOWN_GREENHOUSE_FIELDS) {
        const input = makeInput(fieldCase);
        const result = await classifier.classify(input);

        assert.ok(
          result,
          `classify() returned null for known field "${fieldCase.label}"`,
        );
        assert.equal(
          result!.normalizedKey,
          fieldCase.expectedKey,
          `normalizedKey mismatch for "${fieldCase.label}"`,
        );
        assert.equal(
          result!.source,
          fieldCase.expectedSource,
          `source must be "${fieldCase.expectedSource}" for "${fieldCase.label}", got "${result!.source}"`,
        );
        assert.ok(
          result!.confidence > 0,
          `confidence must be positive for "${fieldCase.label}"`,
        );
      }

      // The critical assertion: the model was never touched.
      assert.equal(
        spy.callCount,
        0,
        `ModelProvider must not be invoked for known Greenhouse fields — was called ${spy.callCount} time(s)`,
      );
    });

    it("model provider is invoked only for truly unknown fields", async () => {
      const spy = makeSpyProvider();
      const classifier = createFieldClassifier(spy);

      const unknownInput: FieldClassifierInput = {
        label: "xyzzy_completely_unknown_field_label_9999",
        selector: "#unknown",
        inputType: "text",
      };

      // The spy throws — that is expected; we just need to confirm it was called.
      await assert.rejects(
        () => classifier.classify(unknownInput),
        /ModelProvider\.complete\(\) must NOT be called/,
        "Expected the spy to be invoked and throw for an unknown field",
      );

      assert.equal(
        spy.callCount,
        1,
        "ModelProvider must be called exactly once when no deterministic match exists",
      );
    });

    it("cache and model are both unused for known fields (no provider at all)", async () => {
      // Creating the classifier with no provider and no cache simulates the
      // minimal deterministic-only configuration.  classify() must still
      // succeed for every known Greenhouse field.
      const classifierNoProvider = createFieldClassifier();

      for (const fieldCase of KNOWN_GREENHOUSE_FIELDS) {
        const input = makeInput(fieldCase);
        const result = await classifierNoProvider.classify(input);

        assert.ok(
          result,
          `classify() returned null without a provider for "${fieldCase.label}"`,
        );
        assert.equal(
          result!.normalizedKey,
          fieldCase.expectedKey,
          `normalizedKey mismatch (no-provider path) for "${fieldCase.label}"`,
        );
        assert.equal(
          result!.source,
          fieldCase.expectedSource,
          `source mismatch (no-provider path) for "${fieldCase.label}"`,
        );
      }
    });
  });
});
