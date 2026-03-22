export type {
  StateHandler,
  StateContext,
  StateResult,
  StateOutcome,
  CommandExecutor,
  ArtifactCaptureFn,
} from "./types.js";

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
  matchScreeningQuestion,
  SCREENING_RULES,
} from "./screening/deterministic-rules.js";

export type {
  ScreeningRule,
  QuestionInteraction,
  MatchResult,
  NoMatchResult,
  RuleMatchOutcome,
} from "./screening/deterministic-rules.js";

export {
  scoreOption,
  pickBestOption,
} from "./screening/option-matcher.js";

export type { OptionCandidate } from "./screening/option-matcher.js";

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
