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
async function fillReactSelect(
  execute: CommandExecutor,
  selector: string,
  desiredValue: string,
  searchSeed?: string,
): Promise<boolean> {
  const questionId = selector.replace(/^#/, "");

  // The seed to type: use searchSeed if provided, else first 3 chars
  const seed = searchSeed
    ?? desiredValue.substring(0, Math.min(desiredValue.length, 3));

  // Step 1-4 combined: TYPE with sequential=true now internally handles
  // scrollIntoView → click → 400ms delay → pressSequentially (ported from
  // apply_agent.py _interact_combobox).  This ensures the React Select
  // input is scrolled into view, focused, and in input-accepting mode
  // before keystrokes are sent.
  await execute({ type: "TYPE", selector, value: seed, sequential: true });

  // Step 5: wait for option elements to appear (2-3s timeout, generous
  // to allow React Select filtering + any async option loading).
  let optionFound = false;
  for (const optSel of OPTION_SELECTORS) {
    const optWait = await execute({
      type: "WAIT_FOR",
      target: optSel,
      timeoutMs: 2500,
    });
    if (optWait.success) {
      optionFound = true;
      break;
    }
  }

  if (!optionFound) {
    // No options appeared — try ArrowDown + Enter as last resort
    // (matches apply_agent.py fallback lines 283-286).
    await execute({ type: "TYPE", selector, value: "", clearFirst: true });
    return false;
  }

  // Step 6: extract ALL visible option labels in one browser round-trip.
  const extractResult = await execute({ type: "EXTRACT_OPTIONS" });
  const optionLabels = extractResult.success
    ? ((extractResult.data as Record<string, unknown>)?.options as string[] ?? [])
    : [];

  if (optionLabels.length > 0) {
    // Step 7: deterministic scoring via the option matcher.
    const best = pickBestOption(desiredValue, optionLabels);

    if (best) {
      // Click by the exact React Select option ID for this dropdown.
      const winnerSelector = `#react-select-${questionId}-option-${best.index}`;
      const exists = await execute({ type: "WAIT_FOR", target: winnerSelector, timeoutMs: 500 });
      if (exists.success) {
        await execute({ type: "CLICK", target: { kind: "css", value: winnerSelector } });
        return true;
      }
    }
  }

  // Step 8: fallback — click the first visible option element.
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
  value: string | null;
  required: boolean;
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

    // Step 2: Filter to screening question fields only (question_* IDs)
    const questions = allFields.filter(
      (f) => f.selector.startsWith("#question_") && f.label,
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

      const match: RuleMatchOutcome = matchScreeningQuestion(q.label, context.data);


      if (!match.matched) {
        // ── LLM fallback for unmatched required freeform questions ──────
        // Deterministic-first: we only reach here when NO rule matched.
        // If an AnswerGeneratorService is wired in the data bag, use it
        // to generate a concise answer for this required question.
        const answerGen = context.data.answerGenerator as AnswerGeneratorService | undefined;
        if (answerGen && q.required) {
          const generated = await answerGen.generate(
            {
              question: q.label,
              fieldType: q.type as "text" | "textarea" | "select" | "radio" | "checkbox",
              jobTitle: context.data.jobTitle as string | undefined,
              company: context.data.company as string | undefined,
              maxLength: 500,
            },
            {},
            undefined,
          );
          if (generated) {
            const typeResult = await context.execute({
              type: "TYPE",
              selector: q.selector,
              value: generated.answer,
              sequential: true,
            });
            if (typeResult.success) {
              answered.push(q.label);
              continue;
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

      if (rule.interaction === "react-select") {
        const fillOk = await fillReactSelect(context.execute, selector, value, rule.searchSeed);
        if (fillOk) {
          answered.push(q.label);
          filled = true;
        } else {
          failed.push(q.label);
        }
      } else {
        // Plain text input — use sequential typing (scroll → click → delay →
        // pressSequentially) so React-controlled inputs and textareas properly
        // process each keystroke via their onChange handlers.
        const typeResult = await context.execute({
          type: "TYPE",
          selector,
          value,
          sequential: true,
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
