import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const initState: StateHandler = {
  name: StateName.INIT,

  entryCriteria:
    "A valid ApplyRun has been created with a resolved job URL, candidate profile, and selected resume file.",

  successCriteria:
    "Run context is fully hydrated: candidate data loaded, resume path confirmed, browser session placeholder initialised.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: hydrate run context, verify candidate + job data, prepare session config
    return { outcome: "success" };
  },
};
