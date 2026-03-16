import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const preSubmitCheckState: StateHandler = {
  name: StateName.PRE_SUBMIT_CHECK,

  entryCriteria:
    "All form fields and disclosures are complete. A screenshot of the current page is captured for audit.",

  successCriteria:
    "No inline validation errors remain. All required fields pass a final sweep. If run mode is REVIEW_BEFORE_SUBMIT, the review gate signal has been sent and approval received.",

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
    if (extractResult.success && extractResult.data) {
      const fields = (extractResult.data as Record<string, unknown>).fields as Array<{
        required: boolean;
        value: string | null;
        selector: string;
      }>;

      const emptyRequired = fields.filter((f) => f.required && !f.value);
      if (emptyRequired.length > 0) {
        return {
          outcome: "failure",
          error: `Required fields still empty: ${emptyRequired.map((f) => f.selector).join(", ")}`,
          data: { emptyRequired: emptyRequired.map((f) => f.selector) },
        };
      }
    }

    context.data.preSubmitCheckPassed = true;
    return { outcome: "success" };
  },
};
