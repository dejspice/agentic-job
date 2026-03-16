import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const answerScreeningQuestionsState: StateHandler = {
  name: StateName.ANSWER_SCREENING_QUESTIONS,

  entryCriteria:
    "Required profile fields are filled. Screening questions section is present on the page (DOM snapshot available).",

  successCriteria:
    "All screening questions have been answered. Answers sourced from the answer bank where possible, generated via LLM otherwise. Generated answers cached back into the answer bank.",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: extract questions, check answer bank (vector retrieval), generate missing answers, fill fields
    return { outcome: "success" };
  },
};
