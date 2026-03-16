export {
  mapFieldDeterministic,
  mapFields,
  toFieldMapping,
  inferFieldType,
  type FieldHint,
  type MappedField,
  type FieldMapperFallback,
} from "./field-mapper.js";

export {
  classifyPageDeterministic,
  classifyPage,
  toPageClassifier,
  type PageSignals,
  type ClassifiedPage,
  type UniversalPageType,
  type PageClassifierFallback,
} from "./page-classifier.js";

export {
  identifyCandidates,
  findNextAction,
  findSubmitAction,
  findApplyEntry,
  findBestAction,
  type NavigationCandidate,
  type NavigableElement,
  type NavigatorFallback,
} from "./navigator.js";
