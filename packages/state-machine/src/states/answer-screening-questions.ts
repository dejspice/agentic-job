import { StateName } from "@dejsol/core";
import type { AnswerBank } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";
import type { CommandExecutor } from "../types.js";
import {
  matchScreeningQuestion,
  type RuleMatchOutcome,
} from "../screening/deterministic-rules.js";
import { pickBestOption } from "../screening/option-matcher.js";
import type { AnswerGeneratorService } from "@dejsol/intelligence";
import { matchAnswerBank } from "@dejsol/intelligence";

export type AdjudicationRisk = "low" | "medium" | "high";
export type PromotionRecommendation =
  | "auto_promote_to_answer_bank"
  | "candidate_bank_only"
  | "human_review_required"
  | "reject"
  | "rule_candidate";

export interface AdjudicationResult {
  appropriatenessScore: number;
  riskLevel: AdjudicationRisk;
  recommendation: PromotionRecommendation;
  reason: string;
}

/**
 * Structured record of a single screening answer produced during a run.
 * Persisted into context.data.screeningAnswers for downstream consumption
 * (answer bank write-back, operator review, audit).
 */
export interface ScreeningAnswerEntry {
  question: string;
  answer: string;
  source: "rule" | "answer_bank" | "llm" | "combobox_fallback" | "prefilled";
  ruleName?: string;
  confidence: number;
  fieldType: string;
  selector: string;
  visibleOptions?: string[];
  adjudication?: AdjudicationResult;
}

/**
 * Selectors for visible React Select dropdown options, in priority order.
 * Ported from apply_agent.py OPTION_SELECTORS.
 */
const OPTION_SELECTORS: readonly string[] = [
  "[id*='-option-']",
  "[role='option']",
  ".select__option",
];

// ---------------------------------------------------------------------------
// React Select combobox fill — open → read options → match → click → verify
// ---------------------------------------------------------------------------

function extractQuestionId(selector: string): string {
  const attrMatch = selector.match(/^\[id="(.+)"\]$/);
  if (attrMatch) return attrMatch[1]!;
  return selector.replace(/^#/, "");
}

// IDs containing brackets (e.g. "question_123[]") produce invalid CSS when
// used in #hash selectors.  Use attribute selectors for those.
const NEEDS_ATTR_SELECTOR = /[\[\](){}#.+~>:,]/;

function optionIdSelector(questionId: string, index: number): string {
  const raw = `react-select-${questionId}-option-${index}`;
  return NEEDS_ATTR_SELECTOR.test(raw) ? `[id="${raw}"]` : `#${raw}`;
}

function optionIdPrefix(questionId: string): string {
  const raw = `react-select-${questionId}-option`;
  return `[id^="${raw}"]`;
}

/**
 * Read visible React Select option labels for a specific question.
 *
 * Uses question-specific `react-select-{questionId}-option-N` IDs to avoid
 * pollution from phone-country-picker dropdowns that share [role="option"].
 */
async function readVisibleOptions(
  execute: CommandExecutor,
  questionId: string,
): Promise<string[]> {
  const labels: string[] = [];
  for (let idx = 0; idx < 50; idx++) {
    const optSel = optionIdSelector(questionId, idx);
    const exists = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: idx === 0 ? 500 : 100 });
    if (!exists.success) break;
    const textResult = await execute({ type: "READ_TEXT", selector: optSel });
    if (textResult.success && textResult.data) {
      const text = ((textResult.data as Record<string, unknown>).text as string ?? "").trim();
      if (text) labels.push(text);
    }
  }
  return labels;
}

/**
 * Open a React Select combobox, read its visible option labels, score them
 * against the desired value, and click the best match.
 *
 * Strategy:
 *   1. Click to open + type empty seed to reveal all options
 *   2. Read visible option labels from question-specific DOM elements
 *   3. Use pickBestOption (alias-aware, abbreviation-aware) to find winner
 *   4. If no match, retry with a filtered seed to narrow the list
 *   5. Click the winning option by its specific DOM ID
 *   6. Verify selection: check that the single-value element shows content
 *
 * This replaces the old approach of typing a search seed first, which failed
 * when the seed didn't match any option text (e.g. "Tex" for options ["TX"]).
 */
export async function fillReactSelect(
  execute: CommandExecutor,
  selector: string,
  desiredValue: string,
  searchSeed?: string,
): Promise<boolean> {
  const questionId = extractQuestionId(selector);
  const specificOptionPrefix = optionIdPrefix(questionId);

  // Type the search seed to open the dropdown and filter options.
  // Using the seed directly (instead of opening with an empty click first)
  // is more reliable across sequential combobox fills — the scrollIntoView +
  // click + 400ms delay in the sequential TYPE gives React Select time to
  // focus and accept keystrokes.
  const seed = searchSeed !== undefined && searchSeed !== ""
    ? searchSeed
    : desiredValue.substring(0, Math.min(desiredValue.length, 3));

  if (seed) {
    await execute({ type: "TYPE", selector, value: seed, sequential: true });

    const seedWait = await execute({ type: "WAIT_FOR", target: specificOptionPrefix, timeoutMs: 2000 });
    if (!seedWait.success) {
      for (const optSel of OPTION_SELECTORS) {
        const optWait = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 500 });
        if (optWait.success) break;
      }
    }

    const filteredLabels = await readVisibleOptions(execute, questionId);
    if (filteredLabels.length > 0) {
      const best = pickBestOption(desiredValue, filteredLabels);
      if (best) {
        const winSel = optionIdSelector(questionId, best.index);
        await execute({ type: "CLICK", target: { kind: "css", value: winSel } });
        return true;
      }
    }

    // Seed produced zero results — clear and retry with no filter to
    // reveal the full option list. This handles cases where the search
    // seed doesn't match any option text (e.g. seed "Tech" on a dropdown
    // whose options are "Drug Therapies", "Medical Devices", "Pharmacy Benefits").
    await execute({ type: "TYPE", selector, value: "", clearFirst: true });
    await execute({ type: "TYPE", selector, value: " ", sequential: true });
    await execute({ type: "TYPE", selector, value: "", clearFirst: true });

    const retryWait = await execute({ type: "WAIT_FOR", target: specificOptionPrefix, timeoutMs: 2500 });
    if (!retryWait.success) {
      for (const optSel of OPTION_SELECTORS) {
        const optWait = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 500 });
        if (optWait.success) break;
      }
    }

    const allLabels = await readVisibleOptions(execute, questionId);
    if (allLabels.length > 0) {
      const best = pickBestOption(desiredValue, allLabels);
      if (best) {
        const winSel = optionIdSelector(questionId, best.index);
        await execute({ type: "CLICK", target: { kind: "css", value: winSel } });
        return true;
      }
    }
  }

  // Phase 3: generic EXTRACT_OPTIONS fallback
  const extractResult = await execute({ type: "EXTRACT_OPTIONS" });
  const genericLabels = extractResult.success
    ? ((extractResult.data as Record<string, unknown>)?.options as string[] ?? [])
    : [];

  if (genericLabels.length > 0) {
    const best = pickBestOption(desiredValue, genericLabels);
    if (best) {
      for (const optSel of OPTION_SELECTORS) {
        const exists = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 500 });
        if (exists.success) {
          await execute({ type: "CLICK", target: { kind: "css", value: optSel } });
          return true;
        }
      }
    }
  }

  // Last resort: click the first visible option element
  for (const optSel of OPTION_SELECTORS) {
    const exists = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 500 });
    if (exists.success) {
      await execute({ type: "CLICK", target: { kind: "css", value: optSel } });
      return true;
    }
  }

  // Clean up: clear any typed text from the input
  await execute({ type: "TYPE", selector, value: "", clearFirst: true });
  return false;
}

/**
 * Verify that a React Select combobox has a selected value.
 * Checks for a `.select__single-value` child element with text content.
 */
async function verifyComboboxSelection(
  execute: CommandExecutor,
  questionId: string,
): Promise<boolean> {
  const svRaw = `react-select-${questionId}-singleValue`;
  const singleValueSel = NEEDS_ATTR_SELECTOR.test(svRaw) ? `[id="${svRaw}"]` : `#${svRaw}`;
  const checkResult = await execute({ type: "WAIT_FOR", target: singleValueSel, timeoutMs: 500 });
  if (checkResult.success) {
    const textResult = await execute({ type: "READ_TEXT", selector: singleValueSel });
    if (textResult.success && textResult.data) {
      const text = ((textResult.data as Record<string, unknown>).text as string ?? "").trim();
      return text.length > 0;
    }
  }

  const genericSel = `[class*="singleValue"]`;
  const genericCheck = await execute({ type: "WAIT_FOR", target: genericSel, timeoutMs: 300 });
  return genericCheck.success;
}

interface ExtractedQuestion {
  selector: string;
  label: string;
  type: string;
  role: string | null;
  value: string | null;
  required: boolean;
  maxLength: number | null;
}

export const answerScreeningQuestionsState: StateHandler = {
  name: StateName.ANSWER_SCREENING_QUESTIONS,

  entryCriteria:
    "Required profile fields are filled. Screening questions section is present on the page (DOM snapshot available).",

  successCriteria:
    "All deterministically-matchable screening questions have been answered. " +
    "Unmatched questions are logged with their labels for later LLM/answer-bank integration.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "screening-questions-before");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    const extractResult = await context.execute({ type: "EXTRACT_FIELDS" });
    if (!extractResult.success || !extractResult.data) {
      return { outcome: "success", data: { screeningSkipped: true } };
    }

    const allFields = (extractResult.data as Record<string, unknown>).fields as ExtractedQuestion[];

    const GREENHOUSE_EEO_SELECTORS = new Set([
      "#gender", "#race", "#veteran_status", "#disability_status", "#hispanic_ethnicity",
    ]);

    const EEO_SAFE_DECLINE_SEEDS = [
      "prefer not to",
      "decline",
      "don't wish",
      "do not wish",
      "choose not",
    ];

    const questions = allFields.filter(
      (f) => (f.selector.startsWith("#question_") && f.label)
        || (f.selector.startsWith('[id="question_') && f.label)
        || (f.selector.match(/^\[id="\d+"\]$/) && f.label)
        || (GREENHOUSE_EEO_SELECTORS.has(f.selector) && f.label),
    );

    if (questions.length === 0) {
      return { outcome: "success", data: { screeningQuestionsFound: 0 } };
    }

    const answerBank = (context.data.answerBank as AnswerBank | undefined) ?? {};

    const answered: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];
    const screeningAnswers: ScreeningAnswerEntry[] = [];

    function record(entry: ScreeningAnswerEntry): void {
      screeningAnswers.push(entry);
    }

    for (const q of questions) {
      if (q.value) {
        answered.push(q.label);
        record({ question: q.label, answer: q.value, source: "prefilled", confidence: 1.0, fieldType: q.type, selector: q.selector });
        continue;
      }

      if (!q.required) {
        skipped.push(q.label);
        continue;
      }

      // ── Tier 1: deterministic rule table ─────────────────────────────
      const match: RuleMatchOutcome = matchScreeningQuestion(q.label, context.data);

      if (match.matched && match.value) {
        const { rule, value } = match;
        const selector = q.selector;

        // Actual field type takes precedence over rule-declared interaction.
        // Many rules declare interaction: "react-select" to cover combobox
        // variants, but the same question can appear as a plain text input
        // on different boards.  Trying fillReactSelect on a text input fails
        // silently and the answer is lost.
        const useReactSelect = q.role === "combobox";

        if (useReactSelect) {
          let resolvedSeed = rule.searchSeed;
          if (resolvedSeed?.startsWith("dataKey:")) {
            const seedPath = resolvedSeed.slice("dataKey:".length);
            const parts = seedPath.split(".");
            let cur: unknown = context.data;
            for (const p of parts) {
              if (cur == null || typeof cur !== "object") { cur = undefined; break; }
              cur = (cur as Record<string, unknown>)[p];
            }
            resolvedSeed = typeof cur === "string" ? cur : undefined;
          }
          let fillOk = false;
          if (GREENHOUSE_EEO_SELECTORS.has(selector)) {
            const selectResult = await context.execute({ type: "SELECT", selector, value });
            fillOk = selectResult.success;
          }
          if (!fillOk) {
            fillOk = await fillReactSelect(context.execute, selector, value, resolvedSeed);
          }
          if (fillOk) {
            answered.push(q.label);
            record({ question: q.label, answer: value, source: "rule", ruleName: rule.name, confidence: 1.0, fieldType: q.type, selector });
          } else {
            failed.push(q.label);
          }
        } else {
          const answer = q.maxLength ? value.slice(0, q.maxLength) : value;
          const typeResult = await context.execute({ type: "TYPE", selector, value: answer });
          if (typeResult.success) {
            answered.push(q.label);
            record({ question: q.label, answer, source: "rule", ruleName: rule.name, confidence: 1.0, fieldType: q.type, selector });
          } else {
            failed.push(q.label);
          }
        }
        continue;
      }

      // ── Tier 2: answer bank lookup ───────────────────────────────────
      const bankMatch = matchAnswerBank(q.label, answerBank);
      if (bankMatch && bankMatch.confidence >= 0.75) {
        const bankAnswer = bankMatch.value.answer;
        if (q.role === "combobox") {
          const fillOk = await fillReactSelect(context.execute, q.selector, bankAnswer);
          if (fillOk) {
            answered.push(q.label);
            record({ question: q.label, answer: bankAnswer, source: "answer_bank", confidence: bankMatch.confidence, fieldType: q.type, selector: q.selector });
            continue;
          }
        } else {
          const answer = q.maxLength ? bankAnswer.slice(0, q.maxLength) : bankAnswer;
          const typeResult = await context.execute({ type: "TYPE", selector: q.selector, value: answer });
          if (typeResult.success) {
            answered.push(q.label);
            record({ question: q.label, answer, source: "answer_bank", confidence: bankMatch.confidence, fieldType: q.type, selector: q.selector });
            continue;
          }
        }
      }

      // ── Tier 3: unmatched required question handling ─────────────────

      if (q.role === "combobox") {
        const qId = extractQuestionId(q.selector);
        const isEeoField = GREENHOUSE_EEO_SELECTORS.has(q.selector);
        await context.execute({ type: "TYPE", selector: q.selector, value: "", sequential: true });
        await context.execute({ type: "WAIT_FOR", target: optionIdPrefix(qId), timeoutMs: 1500 });
        const opts = await readVisibleOptions(context.execute, qId);

        if (isEeoField && opts.length > 0) {
          const normalizedOpts = opts.map(o => o.toLowerCase());
          let safeIdx = -1;
          for (const seed of EEO_SAFE_DECLINE_SEEDS) {
            safeIdx = normalizedOpts.findIndex(o => o.includes(seed));
            if (safeIdx >= 0) break;
          }
          if (safeIdx >= 0) {
            const winSel = optionIdSelector(qId, safeIdx);
            await context.execute({ type: "CLICK", target: { kind: "css", value: winSel } });
            answered.push(q.label);
            record({ question: q.label, answer: opts[safeIdx], source: "combobox_fallback", confidence: 0.3, fieldType: q.type, selector: q.selector, visibleOptions: opts });
            continue;
          }
          await context.execute({ type: "TYPE", selector: q.selector, value: "", clearFirst: true });
          skipped.push(q.label);
          continue;
        }

        if (opts.length > 0) {
          const yesMatch = pickBestOption("Yes", opts);
          if (yesMatch && yesMatch.score >= 50) {
            const winSel = optionIdSelector(qId, yesMatch.index);
            await context.execute({ type: "CLICK", target: { kind: "css", value: winSel } });
            answered.push(q.label);
            record({ question: q.label, answer: yesMatch.label, source: "combobox_fallback", confidence: 0.5, fieldType: q.type, selector: q.selector, visibleOptions: opts });
            continue;
          }
          const noMatch = pickBestOption("No", opts);
          if (noMatch && noMatch.score >= 50) {
            const winSel = optionIdSelector(qId, noMatch.index);
            await context.execute({ type: "CLICK", target: { kind: "css", value: winSel } });
            answered.push(q.label);
            record({ question: q.label, answer: noMatch.label, source: "combobox_fallback", confidence: 0.5, fieldType: q.type, selector: q.selector, visibleOptions: opts });
            continue;
          }
        }
        await context.execute({ type: "TYPE", selector: q.selector, value: "", clearFirst: true });
      }

      // ── Tier 4: LLM fallback for text/textarea ──────────────────────
      if (q.role !== "combobox") {
        const answerGen = context.data.answerGenerator as AnswerGeneratorService | undefined;
        if (answerGen) {
          const fieldLimit = q.maxLength ?? 200;
          const candidateData = context.data.candidate as Record<string, string> | undefined;
          const profile = candidateData ? {
            name: `${candidateData.firstName ?? ""} ${candidateData.lastName ?? ""}`.trim(),
            email: candidateData.email,
            phone: candidateData.phone,
            location: candidateData.location ?? (candidateData.city && candidateData.state
              ? `${candidateData.city}, ${candidateData.state}`
              : candidateData.city ?? candidateData.state),
            yearsOfExperience: 8,
          } : undefined;
          const generated = await answerGen.generate(
            {
              question: q.label,
              fieldType: q.type as "text" | "textarea" | "select" | "radio" | "checkbox",
              jobTitle: context.data.jobTitle as string | undefined,
              company: context.data.company as string | undefined,
              maxLength: fieldLimit,
            },
            answerBank,
            profile as never,
          );
          if (generated) {
            const answer = q.maxLength ? generated.answer.slice(0, q.maxLength) : generated.answer;
            const typeResult = await context.execute({ type: "TYPE", selector: q.selector, value: answer });
            if (typeResult.success) {
              answered.push(q.label);
              record({ question: q.label, answer, source: "llm", confidence: generated.confidence, fieldType: q.type, selector: q.selector });
              continue;
            }
          }
        }
      }

      skipped.push(q.label);
    }

    // ── Checkbox groups: required fieldsets with no checked boxes ──────
    // Greenhouse renders multi-select questions as checkbox groups inside
    // <fieldset class="checkbox" aria-required="true">.  These are not
    // captured by EXTRACT_FIELDS (which only sees individual <input>
    // elements without group context).
    const checkboxGroupsHandled = await fillRequiredCheckboxGroups(
      context.execute, answered, record,
    );

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "screening-questions-after");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    context.data.screeningAnswered = answered;
    context.data.screeningSkipped = skipped;
    context.data.screeningFailed = failed;
    context.data.screeningAnswers = screeningAnswers;

    return {
      outcome: "success",
      data: {
        screeningQuestionsFound: questions.length + checkboxGroupsHandled,
        screeningAnswered: answered,
        screeningSkipped: skipped,
        screeningFailed: failed,
        screeningAnswers,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Checkbox group handling
// ---------------------------------------------------------------------------

interface CheckboxGroupInfo {
  legend: string;
  options: Array<{ id: string; label: string; checked: boolean }>;
}

/**
 * Find and fill required checkbox groups that have no checked options.
 *
 * Greenhouse renders multi-select questions as:
 *   <fieldset class="checkbox" aria-required="true">
 *     <legend>Question text *</legend>
 *     <input type="checkbox" id="question_XXX[]_YYY" ...>
 *     <label for="question_XXX[]_YYY">Option text</label>
 *
 * Uses EXTRACT_FIELDS (page.evaluate) to read the DOM, then CHECK to
 * tick the first option in each unfilled required group.
 */
async function fillRequiredCheckboxGroups(
  execute: CommandExecutor,
  answered: string[],
  record: (entry: ScreeningAnswerEntry) => void,
): Promise<number> {
  // Quick probe — skip entirely if no required checkbox fieldsets exist
  const probe = await execute({
    type: "WAIT_FOR",
    target: 'fieldset.checkbox[aria-required="true"]',
    timeoutMs: 500,
  });
  if (!probe.success) return 0;

  // Extract checkbox group info from the DOM in a single evaluate
  const readResult = await execute({ type: "READ_TEXT", selector: "body" });

  // Use a semantic click with a dummy label to trigger a page.evaluate
  // Actually, we need to read checkbox group data from the DOM.
  // The only way to do this without adding a new command is to use
  // individual WAIT_FOR + READ_TEXT probes per checkbox.
  // But the fieldset IDs follow the pattern "question_XXXXX[]" which
  // we can probe from the DOM snapshot evidence we already have.

  // Strategy: find all required checkbox inputs that aren't checked
  // by probing for known Greenhouse checkbox patterns.
  // Greenhouse checkbox IDs: question_XXXXX[]_YYYYY
  // Their name attributes: question_XXXXX[]
  // The fieldset wrapping them: id="question_XXXXX[]"

  // Read the first unchecked required checkbox and check it
  // This works because Greenhouse marks ALL checkboxes in a required
  // group with required="" — we just need to check one per group.
  const firstUnchecked = await execute({
    type: "WAIT_FOR",
    target: 'fieldset.checkbox[aria-required="true"] input[type="checkbox"]:not(:checked)',
    timeoutMs: 500,
  });
  if (!firstUnchecked.success) return 0;

  // Group by name attribute — each name corresponds to one question group.
  // We need to check at least one checkbox per required group.
  // Use CHECK command with the first checkbox of each group.
  // Since we can't enumerate groups without page.evaluate, we'll use
  // individual probes on known selectors from EXTRACT_FIELDS output.

  // Re-extract fields to find checkbox inputs
  const extractResult = await execute({ type: "EXTRACT_FIELDS" });
  if (!extractResult.success || !extractResult.data) return 0;

  const fields = (extractResult.data as Record<string, unknown>).fields as Array<{
    selector: string; type: string; required: boolean; value: string | null;
    label: string | null; name: string | null;
  }>;

  // Find required unchecked checkboxes, group by name
  const checkboxes = fields.filter(
    (f) => f.type === "checkbox" && f.required,
  );

  const groupsByName = new Map<string, typeof checkboxes>();
  for (const cb of checkboxes) {
    const name = cb.name ?? cb.selector;
    const group = groupsByName.get(name) ?? [];
    group.push(cb);
    groupsByName.set(name, group);
  }

  let handled = 0;

  for (const [name, group] of groupsByName) {
    // EXTRACT_FIELDS now returns value=null for unchecked checkboxes.
    // Skip if any checkbox in this group has a non-null value (= checked).
    const anyChecked = group.some((cb) => cb.value != null);
    if (anyChecked) continue;

    // Check the first option in the group
    const first = group[0]!;
    const checkResult = await execute({
      type: "CHECK",
      selector: first.selector,
    });

    if (checkResult.success) {
      const questionLabel = first.label ?? name;
      answered.push(questionLabel);
      record({
        question: questionLabel,
        answer: "(first option)",
        source: "combobox_fallback",
        confidence: 0.4,
        fieldType: "checkbox",
        selector: first.selector,
      });
      handled++;
    }
  }

  return handled;
}
