import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

interface GreenhouseFieldMapping {
  selector: string;
  dataKey: string;
}

const GREENHOUSE_REQUIRED_FIELDS: GreenhouseFieldMapping[] = [
  { selector: "#first_name", dataKey: "candidate.firstName" },
  { selector: "#last_name", dataKey: "candidate.lastName" },
  { selector: "#email", dataKey: "candidate.email" },
  { selector: "#phone", dataKey: "candidate.phone" },
];

function resolveValue(data: Record<string, unknown>, dotPath: string): string | undefined {
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
    "All required fields (name, email, phone, location, etc.) are filled with correct values sourced from the candidate profile. Validation watcher confirms no inline errors.",

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

    for (const field of GREENHOUSE_REQUIRED_FIELDS) {
      const value = resolveValue(context.data, field.dataKey);
      if (!value) {
        failedFields.push(field.selector);
        continue;
      }

      const result = await context.execute({
        type: "TYPE",
        selector: field.selector,
        value,
        clearFirst: true,
      });

      if (result.success) {
        filledFields.push(field.selector);
      } else {
        failedFields.push(field.selector);
      }
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "fill-fields-after");
      (context.data.artifacts as unknown[]).push(ref);
    }

    context.data.filledFields = filledFields;
    context.data.failedFields = failedFields;

    if (failedFields.length > 0) {
      return {
        outcome: "failure",
        error: `Failed to fill fields: ${failedFields.join(", ")}`,
        data: { filledFields, failedFields },
      };
    }

    return { outcome: "success", data: { filledFields } };
  },
};
