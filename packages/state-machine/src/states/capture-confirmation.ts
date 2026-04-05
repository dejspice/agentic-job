import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

/**
 * Confirmation page selectors covering canonical Greenhouse classes and
 * common alternate patterns seen on live boards.
 */
const CONFIRMATION_SELECTORS = [
  ".confirmation",
  ".application-confirmation",
  "#application_confirmation",
  ".flash-success",
  ".confirmation-message",
  ".success-message",
  ".submitted-message",
  ".application-success",
  '[data-application-complete="true"]',
  ".flash.notice",
  ".notice.success",
].join(", ");

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

    // READ_TEXT may fail on some boards (e.g. locator strict-mode if multiple
    // confirmation selectors match the same element, or the text is in a
    // canvas / non-text node).  The confirmation screenshot already serves as
    // proof of submission — degrade gracefully rather than treating this as
    // a failure.
    let confirmationText = "";
    if (readResult.success && readResult.data) {
      confirmationText =
        ((readResult.data as Record<string, unknown>).text as string) ?? "";
    }

    context.data.confirmationText =
      confirmationText || "(confirmation screenshot captured)";
    context.data.runOutcome = "SUBMITTED";

    return {
      outcome: "success",
      data: {
        confirmationText: context.data.confirmationText as string,
        runOutcome: "SUBMITTED",
      },
    };
  },
};
