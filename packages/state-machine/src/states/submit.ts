import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const submitState: StateHandler = {
  name: StateName.SUBMIT,

  entryCriteria:
    "Pre-submit check passed. Screenshot captured. If review mode, human approval has been received.",

  successCriteria:
    "The submit button has been clicked and the page has transitioned to a confirmation or thank-you page. Screenshot captured post-submit.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: click submit button, wait for navigation/confirmation, capture post-submit screenshot
    return { outcome: "success" };
  },
};
