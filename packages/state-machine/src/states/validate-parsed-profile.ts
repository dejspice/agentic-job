import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const validateParsedProfileState: StateHandler = {
  name: StateName.VALIDATE_PARSED_PROFILE,

  entryCriteria:
    "ATS resume parsing has completed. Pre-filled form fields are available for inspection.",

  successCriteria:
    "All auto-filled fields have been compared against the candidate profile. Mismatches are recorded in context data for correction in subsequent states.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: extract pre-filled values, compare against candidate profile, flag mismatches
    return { outcome: "success" };
  },
};
