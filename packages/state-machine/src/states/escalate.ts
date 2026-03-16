import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const escalateState: StateHandler = {
  name: StateName.ESCALATE,

  entryCriteria:
    "Any prior state has failed beyond its retry/timeout policy, or confidence has dropped below the threshold. This is a terminal state.",

  successCriteria:
    "Escalation record created with full context (state history, error log, screenshots). Run outcome set to ESCALATED. Human review queue notified.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: persist escalation record, capture final artifacts, notify review queue
    return { outcome: "escalated" };
  },
};
