import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const waitForParseState: StateHandler = {
  name: StateName.WAIT_FOR_PARSE,

  entryCriteria:
    "Resume upload completed successfully. The ATS is expected to parse the resume and pre-fill form fields.",

  successCriteria:
    "ATS parsing spinner/indicator has disappeared and form fields are populated (or a stable timeout has passed indicating no auto-parse).",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    const waitResult = await context.execute({
      type: "WAIT_FOR",
      target: "#first_name",
      timeoutMs: 10000,
    });

    if (!waitResult.success) {
      context.data.parseCompleted = false;
      return { outcome: "success", data: { parseTimedOut: true } };
    }

    const firstNameResult = await context.execute({
      type: "READ_TEXT",
      selector: "#first_name",
    });

    const parsed = firstNameResult.success &&
      typeof (firstNameResult.data as Record<string, unknown>)?.text === "string" &&
      ((firstNameResult.data as Record<string, unknown>).text as string).length > 0;

    context.data.parseCompleted = parsed;
    return { outcome: "success", data: { parseCompleted: parsed } };
  },
};
