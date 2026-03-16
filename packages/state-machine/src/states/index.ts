import type { StateHandler } from "../types.js";

import { initState } from "./init.js";
import { openJobPageState } from "./open-job-page.js";
import { detectApplyEntryState } from "./detect-apply-entry.js";
import { loginOrContinueState } from "./login-or-continue.js";
import { uploadResumeState } from "./upload-resume.js";
import { waitForParseState } from "./wait-for-parse.js";
import { validateParsedProfileState } from "./validate-parsed-profile.js";
import { fillRequiredFieldsState } from "./fill-required-fields.js";
import { answerScreeningQuestionsState } from "./answer-screening-questions.js";
import { reviewDisclosuresState } from "./review-disclosures.js";
import { preSubmitCheckState } from "./pre-submit-check.js";
import { submitState } from "./submit.js";
import { captureConfirmationState } from "./capture-confirmation.js";
import { escalateState } from "./escalate.js";

export {
  initState,
  openJobPageState,
  detectApplyEntryState,
  loginOrContinueState,
  uploadResumeState,
  waitForParseState,
  validateParsedProfileState,
  fillRequiredFieldsState,
  answerScreeningQuestionsState,
  reviewDisclosuresState,
  preSubmitCheckState,
  submitState,
  captureConfirmationState,
  escalateState,
};

/**
 * All state handlers in canonical order (mirrors STATE_ORDER from @dejsol/core).
 * Used by the orchestrator to register and iterate states.
 */
export const stateHandlers: readonly StateHandler[] = [
  initState,
  openJobPageState,
  detectApplyEntryState,
  loginOrContinueState,
  uploadResumeState,
  waitForParseState,
  validateParsedProfileState,
  fillRequiredFieldsState,
  answerScreeningQuestionsState,
  reviewDisclosuresState,
  preSubmitCheckState,
  submitState,
  captureConfirmationState,
  escalateState,
];
