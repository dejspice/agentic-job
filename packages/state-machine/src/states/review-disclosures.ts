import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const reviewDisclosuresState: StateHandler = {
  name: StateName.REVIEW_DISCLOSURES,

  entryCriteria:
    "Screening questions answered (or skipped if none present). Disclosure checkboxes, EEO fields, or terms-of-service sections may be visible.",

  successCriteria:
    "All required disclosure checkboxes are checked, voluntary self-identification fields are handled per candidate policy, and no blocking modals remain.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: detect disclosure/EEO/terms sections, apply candidate disclosure policies, check required boxes
    return { outcome: "success" };
  },
};
