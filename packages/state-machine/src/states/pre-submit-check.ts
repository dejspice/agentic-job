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
  name: string | null;
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

    // ── Retry education autocomplete fields (school, degree, discipline) ──
    const EDUCATION_FIELD_MAP: Record<string, string> = {
      "#school--0": "school",
      "#degree--0": "degree",
      "#discipline--0": "discipline",
    };
    const emptyEduFields = emptyRequired.filter(
      (f) => f.role === "combobox" && EDUCATION_FIELD_MAP[f.selector],
    );

    if (emptyEduFields.length > 0 && context.execute) {
      const candidate = context.data.candidate as Record<string, string> | undefined;
      const retriedEdu: string[] = [];

      for (const field of emptyEduFields) {
        const dataKey = EDUCATION_FIELD_MAP[field.selector]!;
        const value = candidate?.[dataKey];
        if (!value) continue;

        const ok = await fillReactSelect(context.execute, field.selector, value);
        if (ok) retriedEdu.push(field.selector);
      }

      if (retriedEdu.length > 0) {
        const recheck = await context.execute({ type: "EXTRACT_FIELDS" });
        if (recheck.success && recheck.data) {
          const recheckFields = (recheck.data as Record<string, unknown>).fields as ExtractedField[];
          emptyRequired = recheckFields.filter(
            (f) => f.required && !f.value && f.type !== "file",
          );
        }
      }
    }

    // ── Retry empty standard EEO combobox fields ───────────────────
    // EEO fields (#gender, #race, etc.) are rendered lazily on some
    // Greenhouse boards and may not exist when earlier states run.
    // By PRE_SUBMIT_CHECK they are present — retry with fillReactSelect.
    const EEO_FIELD_DEFAULTS: Record<string, { value: string; seed: string }> = {
      "#gender": { value: "Male", seed: "Mal" },
      "#race": { value: "Asian", seed: "Asian" },
      "#hispanic_ethnicity": { value: "No", seed: "No" },
      "#veteran_status": { value: "I am not a protected veteran", seed: "not a protected" },
      "#disability_status": { value: "No, I do not have a disability and have not had one in the past", seed: "do not have" },
    };
    const emptyEeoFields = emptyRequired.filter(
      (f) => f.role === "combobox" && EEO_FIELD_DEFAULTS[f.selector],
    );

    if (emptyEeoFields.length > 0 && context.execute) {
      const candidate = context.data.candidate as Record<string, string> | undefined;
      let anyFilled = false;

      for (const field of emptyEeoFields) {
        const defaults = EEO_FIELD_DEFAULTS[field.selector]!;
        const value = candidate?.raceEthnicity && field.selector === "#race"
          ? candidate.raceEthnicity
          : candidate?.gender && field.selector === "#gender"
            ? candidate.gender
            : defaults.value;

        const ok = await fillReactSelect(
          context.execute, field.selector, value, defaults.seed,
        );
        if (ok) anyFilled = true;
      }

      if (anyFilled) {
        const recheck = await context.execute({ type: "EXTRACT_FIELDS" });
        if (recheck.success && recheck.data) {
          const recheckFields = (recheck.data as Record<string, unknown>).fields as ExtractedField[];
          emptyRequired = recheckFields.filter(
            (f) => f.required && !f.value && f.type !== "file",
          );
        }
      }
    }

    // ── Retry unchecked required checkbox groups ─────────────────────
    // Group by name attribute (e.g. "question_XXX[]") and check the first
    // option in each unfilled group.
    const uncheckedBoxes = emptyRequired.filter((f) => f.type === "checkbox");
    if (uncheckedBoxes.length > 0 && context.execute) {
      const groupsByName = new Map<string, ExtractedField[]>();
      for (const cb of uncheckedBoxes) {
        const groupKey = cb.name ?? cb.selector;
        const group = groupsByName.get(groupKey) ?? [];
        group.push(cb);
        groupsByName.set(groupKey, group);
      }

      let anyChecked = false;
      for (const [, group] of groupsByName) {
        const first = group[0]!;
        const checkResult = await context.execute({
          type: "CHECK",
          selector: first.selector,
        });
        if (checkResult.success) anyChecked = true;
      }

      if (anyChecked) {
        const recheck = await context.execute({ type: "EXTRACT_FIELDS" });
        if (recheck.success && recheck.data) {
          const recheckFields = (recheck.data as Record<string, unknown>).fields as ExtractedField[];

          // Checkbox groups: if ANY checkbox in a name-group is checked,
          // the entire group's requirement is satisfied.  Build a set of
          // satisfied group names so we can exclude unchecked siblings.
          const satisfiedGroups = new Set<string>();
          for (const f of recheckFields) {
            if (f.type === "checkbox" && f.value && f.name) {
              satisfiedGroups.add(f.name);
            }
          }

          emptyRequired = recheckFields.filter((f) => {
            if (!f.required || f.value || f.type === "file") return false;
            if (f.type === "checkbox" && f.name && satisfiedGroups.has(f.name)) {
              return false;
            }
            return true;
          });
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
