import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const detectApplyEntryState: StateHandler = {
  name: StateName.DETECT_APPLY_ENTRY,

  entryCriteria:
    "Job page is loaded and confirmed. The page DOM or accessibility tree is available for inspection.",

  successCriteria:
    "An 'Apply' button or equivalent entry point has been identified and its selector is stored in context data.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: scan DOM/a11y tree for apply button, use accelerator pack classifiers first, LLM fallback second
    return { outcome: "success" };
  },
};
