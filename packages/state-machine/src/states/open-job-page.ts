import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const openJobPageState: StateHandler = {
  name: StateName.OPEN_JOB_PAGE,

  entryCriteria:
    "INIT completed successfully. Browser session is allocated and ready. Job URL is available in context.",

  successCriteria:
    "The job listing page has loaded, the page title or key content confirms it matches the expected posting, and no access-denied or CAPTCHA block is present.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: navigate to jobUrl, wait for load, verify page content
    return { outcome: "success" };
  },
};
