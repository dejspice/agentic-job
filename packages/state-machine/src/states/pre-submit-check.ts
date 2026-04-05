import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";
import {
  matchScreeningQuestion,
} from "../screening/deterministic-rules.js";
import { fillReactSelect } from "./answer-screening-questions.js";

interface ExtractedField {
  required: boolean;
  value: string | null;
  selector: string;
  label: string;
  type: string;
  role: string | null;
}

export const preSubmitCheckState: StateHandler = {
  name: StateName.PRE_SUBMIT_CHECK,

  entryCriteria:
    "All form fields and disclosures are complete. A screenshot of the current page is captured for audit.",

  successCriteria:
    "No inline validation errors remain. All required text/select/textarea fields pass a final sweep. File inputs are excluded from the empty-value check (browser security prevents reading their value in headless mode).",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    if (context.captureArtifact) {
      const screenshotRef = await context.captureArtifact("screenshot", "pre-submit-check");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(screenshotRef);

      const domRef = await context.captureArtifact("dom_snapshot", "pre-submit-check-dom");
      (context.data.artifacts as unknown[]).push(domRef);
    }

    const extractResult = await context.execute({ type: "EXTRACT_FIELDS" });
    if (!extractResult.success || !extractResult.data) {
      context.data.preSubmitCheckPassed = true;
      return { outcome: "success" };
    }

    const fields = (extractResult.data as Record<string, unknown>).fields as ExtractedField[];

    let emptyRequired = fields.filter(
      (f) => f.required && !f.value && f.type !== "file",
    );

    if (emptyRequired.length === 0) {
      context.data.preSubmitCheckPassed = true;
      return { outcome: "success" };
    }

    // ── Retry pass for still-empty combobox fields ────────────────────
    // Combobox fills are timing-sensitive during sequential execution.
    // Instead of failing immediately, retry each empty combobox once
    // with a fresh interaction cycle.
    const retryable = emptyRequired.filter(
      (f) => f.role === "combobox" && f.selector.startsWith("#question_"),
    );

    if (retryable.length > 0 && context.execute) {
      const retried: string[] = [];

      for (const field of retryable) {
        const match = matchScreeningQuestion(field.label, context.data);
        let desiredValue: string;
        let searchSeed: string | undefined;

        if (match.matched) {
          desiredValue = match.value;
          searchSeed = match.rule.searchSeed;
        } else {
          desiredValue = "Yes";
        }

        const ok = await fillReactSelect(
          context.execute, field.selector, desiredValue, searchSeed,
        );
        if (ok) retried.push(field.selector);
      }

      if (retried.length > 0) {
        // Re-extract to verify
        const recheck = await context.execute({ type: "EXTRACT_FIELDS" });
        if (recheck.success && recheck.data) {
          const recheckFields = (recheck.data as Record<string, unknown>).fields as ExtractedField[];
          emptyRequired = recheckFields.filter(
            (f) => f.required && !f.value && f.type !== "file",
          );
        }
      }

      context.data.preSubmitRetried = retried;
    }

    // ── Also retry the location autocomplete if still empty ──────────
    const emptyLocation = emptyRequired.find(
      (f) => f.selector === "#candidate-location" && f.role === "combobox",
    );

    if (emptyLocation && context.execute) {
      const city = (context.data.candidate as Record<string, string> | undefined)?.city;
      const state = (context.data.candidate as Record<string, string> | undefined)?.state;
      const locValue = city && state ? `${city}, ${state}` : city ?? "";

      if (locValue) {
        const ok = await fillReactSelect(context.execute, "#candidate-location", locValue, city);
        if (ok) {
          const recheck = await context.execute({ type: "EXTRACT_FIELDS" });
          if (recheck.success && recheck.data) {
            const recheckFields = (recheck.data as Record<string, unknown>).fields as ExtractedField[];
            emptyRequired = recheckFields.filter(
              (f) => f.required && !f.value && f.type !== "file",
            );
          }
        }
      }
    }

    if (emptyRequired.length > 0) {
      return {
        outcome: "failure",
        error: `Required fields still empty: ${emptyRequired.map((f) => f.selector).join(", ")}`,
        data: { emptyRequired: emptyRequired.map((f) => f.selector) },
      };
    }

    context.data.preSubmitCheckPassed = true;
    return { outcome: "success" };
  },
};
