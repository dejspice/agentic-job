export type { StateHandler, StateContext, StateResult, StateOutcome } from "./types.js";

export { ApplyStateMachine } from "./state-machine.js";

export { STATE_POLICIES } from "./policies.js";

export {
  scanPageForValidationIssues,
} from "./validation-watcher.js";

export type {
  ValidationIssueCategory,
  ValidationIssueSeverity,
  ValidationIssue,
  PageValidationSignal,
  ValidationWatcherResult,
} from "./validation-watcher.js";

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
  stateHandlers,
} from "./states/index.js";
