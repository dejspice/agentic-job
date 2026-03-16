import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

const CONFIRMATION_SELECTORS =
  ".application-confirmation, #application_confirmation, .flash-success";

export const captureConfirmationState: StateHandler = {
  name: StateName.CAPTURE_CONFIRMATION,

  entryCriteria:
    "Submit action completed. The page shows a confirmation message, confirmation number, or thank-you content.",

  successCriteria:
    "Confirmation ID or text has been extracted and stored. Final screenshot and DOM snapshot captured. Run outcome set to SUBMITTED.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    if (context.captureArtifact) {
      const screenshotRef = await context.captureArtifact(
        "confirmation_screenshot",
        "confirmation",
      );
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(screenshotRef);

      const domRef = await context.captureArtifact("dom_snapshot", "confirmation-dom");
      (context.data.artifacts as unknown[]).push(domRef);
    }

    const readResult = await context.execute({
      type: "READ_TEXT",
      selector: CONFIRMATION_SELECTORS,
    });

    let confirmationText = "";
    if (readResult.success && readResult.data) {
      confirmationText = (readResult.data as Record<string, unknown>).text as string ?? "";
    }

    context.data.confirmationText = confirmationText;
    context.data.runOutcome = "SUBMITTED";

    return {
      outcome: "success",
      data: { confirmationText, runOutcome: "SUBMITTED" },
    };
  },
};
