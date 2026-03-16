import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

const GREENHOUSE_APPLY_SELECTORS = [
  "#app_submit",
  "a[href*='#app']",
  ".btn-apply",
  'a[href*="#application"]',
];

export const detectApplyEntryState: StateHandler = {
  name: StateName.DETECT_APPLY_ENTRY,

  entryCriteria:
    "Job page is loaded and confirmed. The page DOM or accessibility tree is available for inspection.",

  successCriteria:
    "An 'Apply' button or equivalent entry point has been identified and its selector is stored in context data.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    const combined = GREENHOUSE_APPLY_SELECTORS.join(", ");

    const waitResult = await context.execute({
      type: "WAIT_FOR",
      target: combined,
      timeoutMs: 5000,
    });

    if (!waitResult.success) {
      return { outcome: "failure", error: "Apply entry point not found" };
    }

    const clickResult = await context.execute({
      type: "CLICK",
      target: { kind: "css", value: combined },
    });

    if (!clickResult.success) {
      return { outcome: "failure", error: clickResult.error ?? "Failed to click apply entry" };
    }

    context.data.applyEntryClicked = true;
    return { outcome: "success" };
  },
};
