import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const captureConfirmationState: StateHandler = {
  name: StateName.CAPTURE_CONFIRMATION,

  entryCriteria:
    "Submit action completed. The page shows a confirmation message, confirmation number, or thank-you content.",

  successCriteria:
    "Confirmation ID or text has been extracted and stored. Final screenshot and DOM snapshot captured. Run outcome set to SUBMITTED.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: extract confirmation ID/text, capture final artifacts, mark run as submitted
    return { outcome: "success" };
  },
};
