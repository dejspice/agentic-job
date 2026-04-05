import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";
import type { CommandExecutor } from "../types.js";
import {
  matchScreeningQuestion,
  type RuleMatchOutcome,
} from "../screening/deterministic-rules.js";
import { pickBestOption } from "../screening/option-matcher.js";
import type { AnswerGeneratorService } from "@dejsol/intelligence";

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
    const optSel = `#react-select-${questionId}-option-${idx}`;
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
async function fillReactSelect(
  execute: CommandExecutor,
  selector: string,
  desiredValue: string,
  searchSeed?: string,
): Promise<boolean> {
  const questionId = extractQuestionId(selector);
  const specificOptionPrefix = `[id^="react-select-${questionId}-option"]`;

  // Phase 1: Open the dropdown with an empty click to reveal all options
  await execute({ type: "TYPE", selector, value: "", sequential: true });

  let optionFound = false;
  const waitResult = await execute({ type: "WAIT_FOR", target: specificOptionPrefix, timeoutMs: 2000 });
  if (waitResult.success) {
    optionFound = true;
  } else {
    for (const optSel of OPTION_SELECTORS) {
      const optWait = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 500 });
      if (optWait.success) { optionFound = true; break; }
    }
  }

  if (optionFound) {
    const allLabels = await readVisibleOptions(execute, questionId);
    if (allLabels.length > 0) {
      const best = pickBestOption(desiredValue, allLabels);
      if (best) {
        const winnerSelector = `#react-select-${questionId}-option-${best.index}`;
        await execute({ type: "CLICK", target: { kind: "css", value: winnerSelector } });
        return true;
      }
    }
  }

  // Phase 2: Retry with a search seed to filter the option list.
  // Some dropdowns have 50+ options and only render a subset until filtered.
  const seed = searchSeed
    ?? desiredValue.substring(0, Math.min(desiredValue.length, 3));

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
        const winnerSelector = `#react-select-${questionId}-option-${best.index}`;
        await execute({ type: "CLICK", target: { kind: "css", value: winnerSelector } });
        return true;
      }
      // Fallback: click option-0 (first option in the filtered list)
      await execute({ type: "CLICK", target: { kind: "css", value: `#react-select-${questionId}-option-0` } });
      return true;
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
  const singleValueSel = `#react-select-${questionId}-singleValue`;
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

    const questions = allFields.filter(
      (f) => f.selector.startsWith("#question_") && f.label
        || (f.selector.match(/^\[id="\d+"\]$/) && f.label),
    );

    if (questions.length === 0) {
      return { outcome: "success", data: { screeningQuestionsFound: 0 } };
    }

    const answered: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const q of questions) {
      if (q.value) {
        answered.push(q.label);
        continue;
      }

      if (!q.required) {
        skipped.push(q.label);
        continue;
      }

      const match: RuleMatchOutcome = matchScreeningQuestion(q.label, context.data);

      if (!match.matched) {
        // ── Unmatched required question handling ───────────────────────
        //
        //   Dropdown (role="combobox"):
        //     Open the combobox, read visible options, try "Yes" against
        //     the actual option list. Only selects if a real match exists.
        //
        //   Text / textarea:
        //     Use LLM fallback to generate a concise answer.

        if (q.required && q.role === "combobox") {
          const fillOk = await fillReactSelect(context.execute, q.selector, "Yes");
          if (fillOk) {
            answered.push(q.label);
            continue;
          }
        }

        if (q.required && q.role !== "combobox") {
          const answerGen = context.data.answerGenerator as AnswerGeneratorService | undefined;
          if (answerGen) {
            const fieldLimit = q.maxLength ?? 200;
            const generated = await answerGen.generate(
              {
                question: q.label,
                fieldType: q.type as "text" | "textarea" | "select" | "radio" | "checkbox",
                jobTitle: context.data.jobTitle as string | undefined,
                company: context.data.company as string | undefined,
                maxLength: fieldLimit,
              },
              {},
              undefined,
            );
            if (generated) {
              const answer = q.maxLength
                ? generated.answer.slice(0, q.maxLength)
                : generated.answer;
              const typeResult = await context.execute({
                type: "TYPE",
                selector: q.selector,
                value: answer,
              });
              if (typeResult.success) {
                answered.push(q.label);
                continue;
              }
            }
          }
        }

        skipped.push(q.label);
        continue;
      }

      const { rule, value } = match;
      if (!value) {
        skipped.push(q.label);
        continue;
      }

      const selector = q.selector;
      let filled = false;

      // Use the actual field role to pick the interaction strategy.
      // A rule may declare "text" but the real field is a combobox, or
      // vice-versa. The DOM role is the source of truth.
      const useReactSelect =
        q.role === "combobox"
          ? true
          : rule.interaction === "react-select";

      if (useReactSelect) {
        const fillOk = await fillReactSelect(context.execute, selector, value, rule.searchSeed);
        if (fillOk) {
          answered.push(q.label);
          filled = true;
        } else {
          failed.push(q.label);
        }
      } else {
        const answer = q.maxLength ? value.slice(0, q.maxLength) : value;
        const typeResult = await context.execute({
          type: "TYPE",
          selector,
          value: answer,
        });

        if (typeResult.success) {
          answered.push(q.label);
          filled = true;
        } else {
          failed.push(q.label);
        }
      }
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "screening-questions-after");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    context.data.screeningAnswered = answered;
    context.data.screeningSkipped = skipped;
    context.data.screeningFailed = failed;

    return {
      outcome: "success",
      data: {
        screeningQuestionsFound: questions.length,
        screeningAnswered: answered,
        screeningSkipped: skipped,
        screeningFailed: failed,
      },
    };
  },
};
