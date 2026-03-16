import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const waitForParseState: StateHandler = {
  name: StateName.WAIT_FOR_PARSE,

  entryCriteria:
    "Resume upload completed successfully. The ATS is expected to parse the resume and pre-fill form fields.",

  successCriteria:
    "ATS parsing spinner/indicator has disappeared and form fields are populated (or a stable timeout has passed indicating no auto-parse).",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: wait for parse indicators, poll for field population, respect timeout
    return { outcome: "success" };
  },
};
