import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const loginOrContinueState: StateHandler = {
  name: StateName.LOGIN_OR_CONTINUE,

  entryCriteria:
    "Apply entry point has been clicked. The resulting page may be a login/registration wall or may proceed directly to the application form.",

  successCriteria:
    "Either (a) the user is authenticated and on the application form, or (b) no login was required and the application form is visible.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: detect login wall, handle OAuth/email login, or skip if not required
    return { outcome: "success" };
  },
};
