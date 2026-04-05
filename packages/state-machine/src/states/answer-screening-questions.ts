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
// React Select dropdown fill — interaction pattern ported from apply_agent.py
// ---------------------------------------------------------------------------

/**
 * Open a React Select combobox, type a search value, read visible option
 * labels, deterministically score them, and click the best match.
 *
 * The interaction timing is ported directly from apply_agent.py's
 * _interact_combobox function which is proven reliable on live Greenhouse:
 *
 *   1. scroll the input into view
 *   2. click the input (locator.click, not page.click)
 *   3. wait 400ms for React Select to process the click
 *   4. type the search seed character-by-character
 *   5. wait for option elements to appear
 *   6. extract all visible option labels
 *   7. score and click the best match
 *   8. fallback: ArrowDown + Enter if no option matched
 *
 * Steps 2-4 are critical: React Select needs a real click followed by a
 * delay before it accepts keystroke input for filtering.  Without the
 * delay, keystrokes are lost or misrouted.
 */
function extractQuestionId(selector: string): string {
  const attrMatch = selector.match(/^\[id="(.+)"\]$/);
  if (attrMatch) return attrMatch[1]!;
  return selector.replace(/^#/, "");
}

async function fillReactSelect(
  execute: CommandExecutor,
  selector: string,
  desiredValue: string,
  searchSeed?: string,
): Promise<boolean> {
  const questionId = extractQuestionId(selector);

  // The seed to type: use searchSeed if provided, else first 3 chars
  const seed = searchSeed
    ?? desiredValue.substring(0, Math.min(desiredValue.length, 3));

  // Step 1-4 combined: TYPE with sequential=true now internally handles
  // scrollIntoView → click → 400ms delay → pressSequentially (ported from
  // apply_agent.py _interact_combobox).  This ensures the React Select
  // input is scrolled into view, focused, and in input-accepting mode
  // before keystrokes are sent.
  await execute({ type: "TYPE", selector, value: seed, sequential: true });

  // Step 5: wait for THIS dropdown's options specifically.
  // The question-specific selector avoids matching phone-country-picker
  // options (iti-*) that are also [role="option"] and pollute generic
  // OPTION_SELECTORS queries.
  const specificOptionPrefix = `[id^="react-select-${questionId}-option"]`;
  let optionFound = false;

  const specificWait = await execute({
    type: "WAIT_FOR",
    target: specificOptionPrefix,
    timeoutMs: 2000,
  });
  if (specificWait.success) {
    optionFound = true;
  } else {
    for (let i = 0; i < OPTION_SELECTORS.length; i++) {
      const optWait = await execute({
        type: "WAIT_FOR",
        target: OPTION_SELECTORS[i]!,
        timeoutMs: i === 0 ? 1500 : 500,
      });
      if (optWait.success) {
        optionFound = true;
        break;
      }
    }
  }

  if (!optionFound) {
    await execute({ type: "TYPE", selector, value: "", clearFirst: true });
    return false;
  }

  // Step 6: read option labels from question-specific React Select
  // elements. Using the specific `react-select-{questionId}-option-N`
  // IDs avoids polluted results from phone-country-picker dropdowns
  // that are also [role="option"] in the DOM.
  //
  // We read up to 50 options by probing option-0 through option-49.
  // This is faster than EXTRACT_OPTIONS and immune to pollution.
  const specificLabels: string[] = [];
  for (let idx = 0; idx < 50; idx++) {
    const optSel = `#react-select-${questionId}-option-${idx}`;
    const exists = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: idx === 0 ? 500 : 100 });
    if (!exists.success) break;
    const textResult = await execute({ type: "READ_TEXT", selector: optSel });
    if (textResult.success && textResult.data) {
      const text = ((textResult.data as Record<string, unknown>).text as string ?? "").trim();
      if (text) specificLabels.push(text);
    }
  }

  if (specificLabels.length > 0) {
    const best = pickBestOption(desiredValue, specificLabels);
    if (best) {
      const winnerSelector = `#react-select-${questionId}-option-${best.index}`;
      await execute({ type: "CLICK", target: { kind: "css", value: winnerSelector } });
      return true;
    }
    // Fallback: click option-0 (first option in the filtered list)
    await execute({ type: "CLICK", target: { kind: "css", value: `#react-select-${questionId}-option-0` } });
    return true;
  }

  // Step 8: fallback — use generic EXTRACT_OPTIONS + generic click.
  const extractResult = await execute({ type: "EXTRACT_OPTIONS" });
  const optionLabels = extractResult.success
    ? ((extractResult.data as Record<string, unknown>)?.options as string[] ?? [])
    : [];

  if (optionLabels.length > 0) {
    const best = pickBestOption(desiredValue, optionLabels);
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

  // Last resort: click the first generic option element.
  for (const optSel of OPTION_SELECTORS) {
    const exists = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 500 });
    if (exists.success) {
      await execute({ type: "CLICK", target: { kind: "css", value: optSel } });
      return true;
    }
  }

  return false;
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

    // Step 1: Extract all form fields from the page
    const extractResult = await context.execute({ type: "EXTRACT_FIELDS" });
    if (!extractResult.success || !extractResult.data) {
      return { outcome: "success", data: { screeningSkipped: true } };
    }

    const allFields = (extractResult.data as Record<string, unknown>).fields as ExtractedQuestion[];

    // Step 2: Filter to screening question fields.
    // Greenhouse uses question_* IDs for custom questions, but some forms
    // also use plain numeric IDs (e.g. #1255) for EEO/company-specific
    // questions that appear in the screening section.  Include both patterns.
    const questions = allFields.filter(
      (f) => f.selector.startsWith("#question_") && f.label
        || (f.selector.match(/^\[id="\d+"\]$/) && f.label),
    );

    if (questions.length === 0) {
      return { outcome: "success", data: { screeningQuestionsFound: 0 } };
    }

    // Step 3: Match each question against the deterministic rule table
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
        // Deterministic-first: we only reach here when NO rule matched.
        // Strategy depends on the field type:
        //
        //   Dropdown (role="combobox"):
        //     Try selecting "Yes" deterministically.  Do NOT call the LLM
        //     — LLM-generated text typed into a React Select produces
        //     "No options" and wastes time.
        //
        //   Text / textarea:
        //     Use LLM fallback to generate a concise answer.

        if (q.required && q.role === "combobox") {
          // Unmatched required dropdown — try "Yes" as the safest default
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
              // Plain text fields don't need sequential typing — use fill()
              // for speed. Only React Select comboboxes need pressSequentially.
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

    // Do not fail the state for unmatched questions — the system is
    // deterministic-first and unmatched questions are expected until the
    // answer bank / LLM layer is implemented.
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
