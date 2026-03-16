import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const fillRequiredFieldsState: StateHandler = {
  name: StateName.FILL_REQUIRED_FIELDS,

  entryCriteria:
    "Parsed profile validation is complete. A DOM snapshot of the form is available. Required empty or mismatched fields have been identified.",

  successCriteria:
    "All required fields (name, email, phone, location, etc.) are filled with correct values sourced from the candidate profile. Validation watcher confirms no inline errors.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: iterate required fields, use deterministic mapping first, LLM fallback, type values via browser worker
    return { outcome: "success" };
  },
};
