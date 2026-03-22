import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

interface GreenhouseFieldDef {
  /**
   * CSS selectors in priority order.
   * The first selector that passes a 200 ms WAIT_FOR check is used for TYPE.
   * Covers id-based (canonical), name-based (common live-site variant), and
   * type/name-contains fallbacks.
   */
  selectors: readonly string[];
  /** Dot-path into context.data for the candidate value. */
  dataKey: string;
  /**
   * When false, absence of a value in the data bag does NOT count as a failure.
   * The field is silently skipped rather than added to failedFields.
   * Phone is optional on many Greenhouse boards.
   */
  required: boolean;
  /**
   * When "react-select", the field is a React Select dropdown. Filling
   * requires clicking the control, typing the value, then pressing Enter
   * to select the matching option.
   */
  interaction?: "type" | "react-select";
}

/**
 * Greenhouse personal-info field definitions with multi-selector fallback.
 *
 * Priority order within each selectors array:
 *   1. Canonical ID (#field_name)
 *   2. Canonical name (job_application[field_name])
 *   3. name*= partial-match
 *   4. id*= partial-match / type-based
 */
const GREENHOUSE_FIELDS: readonly GreenhouseFieldDef[] = [
  {
    selectors: [
      "#first_name",
      'input[name="job_application[first_name]"]',
      'input[name*="first_name"]',
      'input[id*="first_name"]',
    ],
    dataKey: "candidate.firstName",
    required: true,
  },
  {
    selectors: [
      "#last_name",
      'input[name="job_application[last_name]"]',
      'input[name*="last_name"]',
      'input[id*="last_name"]',
    ],
    dataKey: "candidate.lastName",
    required: true,
  },
  {
    selectors: [
      "#email",
      'input[name="job_application[email]"]',
      'input[type="email"]',
      'input[name*="email"]',
    ],
    dataKey: "candidate.email",
    required: true,
  },
  {
    selectors: [
      "#phone",
      'input[name="job_application[phone]"]',
      'input[type="tel"]',
      'input[name*="phone"]',
    ],
    dataKey: "candidate.phone",
    required: false,
  },
  {
    selectors: [
      "#country",
      'input[id="country"]',
      'input[name*="country"]',
    ],
    dataKey: "candidate.country",
    required: false,
    interaction: "react-select",
  },
  {
    selectors: [
      "#candidate-location",
      "#job_application_location",
      'input[role="combobox"][id*="location"]',
      'input[id*="location"]',
    ],
    dataKey: "candidate.location",
    required: false,
    interaction: "react-select",
  },
];

function resolveValue(
  data: Record<string, unknown>,
  dotPath: string,
): string | undefined {
  const parts = dotPath.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export const fillRequiredFieldsState: StateHandler = {
  name: StateName.FILL_REQUIRED_FIELDS,

  entryCriteria:
    "Parsed profile validation is complete. A DOM snapshot of the form is available. Required empty or mismatched fields have been identified.",

  successCriteria:
    "All required fields (name, email, etc.) are filled with correct values sourced from the candidate profile. Optional absent fields are skipped.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "fill-fields-before");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    const filledFields: string[] = [];
    const failedFields: string[] = [];

    for (const field of GREENHOUSE_FIELDS) {
      const value = resolveValue(context.data, field.dataKey);

      if (!value) {
        // Skip optional fields silently; mark required ones as failures.
        if (field.required) {
          failedFields.push(field.selectors[0]!);
        }
        continue;
      }

      let filled = false;

      for (const selector of field.selectors) {
        const checkResult = await context.execute({
          type: "WAIT_FOR",
          target: selector,
          timeoutMs: 200,
        });
        if (!checkResult.success) continue;

        if (field.interaction === "react-select") {
          // React Select / combobox interaction ported from apply_agent.py:
          // 1. Click to open the dropdown
          // 2. Type sequentially (char by char) to trigger filtering
          // 3. Wait for dropdown options to appear
          // 4. Click the first matching option (fallback: ArrowDown + Enter)
          const clickResult = await context.execute({
            type: "CLICK",
            target: { kind: "css", value: selector },
          });
          if (!clickResult.success) continue;

          const typeResult = await context.execute({
            type: "TYPE",
            selector,
            value,
            sequential: true,
          });
          if (!typeResult.success) continue;

          // Wait for dropdown option suggestions to appear.
          // Includes React Select, ARIA options, and Google Places autocomplete
          // selectors (ported from apply_agent.py OPTION_SELECTORS).
          const OPTION_SELECTORS = [
            "[id*='-option-']",
            "[role='option']",
            ".select__option",
            ".pac-item",
            "[class*='suggestion']",
            "[class*='autocomplete'] li",
          ];
          let optionClicked = false;
          for (const optSel of OPTION_SELECTORS) {
            const optWait = await context.execute({
              type: "WAIT_FOR",
              target: optSel,
              timeoutMs: 3000,
            });
            if (optWait.success) {
              await context.execute({
                type: "CLICK",
                target: { kind: "css", value: optSel },
              });
              optionClicked = true;
              break;
            }
          }

          filledFields.push(selector);
          filled = true;
          break;
        } else {
          const typeResult = await context.execute({
            type: "TYPE",
            selector,
            value,
            clearFirst: true,
          });

          if (typeResult.success) {
            filledFields.push(selector);
            filled = true;
            break;
          }
        }
      }

      if (!filled && field.required) {
        failedFields.push(field.selectors[0]!);
      }
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "fill-fields-after");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    context.data.filledFields = filledFields;
    context.data.failedFields = failedFields;

    if (failedFields.length > 0) {
      if (context.captureArtifact) {
        const ref = await context.captureArtifact("screenshot", "fill-fields-failure");
        context.data.artifacts = context.data.artifacts ?? [];
        (context.data.artifacts as unknown[]).push(ref);
      }
      return {
        outcome: "failure",
        error: `Failed to fill required fields: ${failedFields.join(", ")}`,
        data: { filledFields, failedFields },
      };
    }

    return { outcome: "success", data: { filledFields } };
  },
};
