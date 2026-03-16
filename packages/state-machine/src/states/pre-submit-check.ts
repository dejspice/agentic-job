import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const preSubmitCheckState: StateHandler = {
  name: StateName.PRE_SUBMIT_CHECK,

  entryCriteria:
    "All form fields and disclosures are complete. A screenshot of the current page is captured for audit.",

  successCriteria:
    "No inline validation errors remain. All required fields pass a final sweep. If run mode is REVIEW_BEFORE_SUBMIT, the review gate signal has been sent and approval received.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: final validation sweep, screenshot capture, trigger review gate if applicable
    return { outcome: "success" };
  },
};
