import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";
import { pickBestOption } from "../screening/option-matcher.js";

// ---------------------------------------------------------------------------
// EEO / voluntary self-identification field definitions
// ---------------------------------------------------------------------------

const GREENHOUSE_STANDARD_EEO: ReadonlyArray<{
  selector: string;
  label: string;
  dataKey: string;
  fallback: string;
  searchSeed: string;
}> = [
  {
    selector: "#gender",
    label: "Gender",
    dataKey: "candidate.gender",
    fallback: "Male",
    searchSeed: "Mal",
  },
  {
    selector: "#hispanic_ethnicity",
    label: "Are you Hispanic/Latino?",
    dataKey: "candidate.hispanicLatino",
    fallback: "No",
    searchSeed: "No",
  },
  {
    selector: "#veteran_status",
    label: "Veteran Status",
    dataKey: "candidate.veteranStatus",
    fallback: "I am not a protected veteran",
    searchSeed: "not a protected",
  },
  {
    selector: "#disability_status",
    label: "Disability Status",
    dataKey: "candidate.disabilityStatus",
    fallback: "No, I do not have a disability and have not had one in the past",
    searchSeed: "do not have",
  },
];

const CUSTOM_EEO_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  dataKey: string;
  fallback: string;
}> = [
  {
    pattern: /gender\s*identity|describe.*gender/i,
    dataKey: "candidate.gender",
    fallback: "Cisgender man",
  },
  {
    pattern: /race.*ethnicity|ethnicity.*race|racial.*background|describe.*racial/i,
    dataKey: "candidate.raceEthnicity",
    fallback: "South Asian",
  },
  {
    pattern: /military\s*status|armed\s*forces/i,
    dataKey: "candidate.veteranStatus",
    fallback: "I am not a protected veteran",
  },
  {
    pattern: /disability\s*status|substantially\s*limits/i,
    dataKey: "candidate.disabilityStatus",
    fallback: "No, I do not have a disability and have not had one in the past",
  },
  {
    pattern: /lgbtq|sexual\s*orientation/i,
    dataKey: "candidate.lgbtq",
    fallback: "Decline to self-identify",
  },
];

const OPTION_SELECTORS: readonly string[] = [
  "[id*='-option-']",
  "[role='option']",
  ".select__option",
];

const DISCLOSURE_CHECKBOX_SELECTORS: readonly string[] = [
  "#gdpr_demographic_data_consent_given_1",
  "input[name='gdpr_demographic_data_consent_given']",
];

const INTER_DROPDOWN_SETTLE_MS = 400;
const SETTLE_SELECTOR = "#__rsd_settle_never_exists__";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDataKey(data: Record<string, unknown>, dotPath: string): string | undefined {
  if (!dotPath) return undefined;
  const parts = dotPath.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Fill a React Select EEO dropdown using the proven sequential interaction
 * pattern: scroll → click → 400ms delay → type search seed → wait for
 * options → score & click best match → Escape to close menu.
 *
 * This mirrors fillReactSelect in answer-screening-questions.ts and the
 * original apply_agent.py _interact_combobox timing.
 */
async function fillEeoDropdown(
  context: StateContext,
  selector: string,
  desiredValue: string,
  searchSeed: string,
): Promise<boolean> {
  if (!context.execute) return false;

  const attrMatch = selector.match(/^\[id="(.+)"\]$/);
  const questionId = attrMatch ? attrMatch[1]! : selector.replace(/^#/, "");
  const seed = searchSeed || desiredValue.substring(0, Math.min(desiredValue.length, 3));

  // TYPE sequential: scrollIntoView → click → 400ms delay → pressSequentially.
  // This is the same proven pattern used for screening question dropdowns.
  const typeResult = await context.execute({
    type: "TYPE",
    selector,
    value: seed,
    sequential: true,
  });
  if (!typeResult.success) return false;

  // Wait for option elements to appear — primary selector gets a generous
  // timeout, fallbacks are short.
  let optionFound = false;
  for (let i = 0; i < OPTION_SELECTORS.length; i++) {
    const optWait = await context.execute({
      type: "WAIT_FOR",
      target: OPTION_SELECTORS[i]!,
      timeoutMs: i === 0 ? 1500 : 500,
    });
    if (optWait.success) {
      optionFound = true;
      break;
    }
  }

  if (!optionFound) {
    // Seed filtered out all options — clear the input and re-open the menu
    // with no filter text so all options are visible.
    await context.execute({ type: "TYPE", selector, value: "", clearFirst: true });
    await context.execute({ type: "TYPE", selector, value: "", sequential: true });
    for (let i = 0; i < OPTION_SELECTORS.length; i++) {
      const optWait = await context.execute({
        type: "WAIT_FOR",
        target: OPTION_SELECTORS[i]!,
        timeoutMs: i === 0 ? 1500 : 500,
      });
      if (optWait.success) {
        optionFound = true;
        break;
      }
    }
    if (!optionFound) return false;
  }

  // Extract visible option labels
  const extractResult = await context.execute({ type: "EXTRACT_OPTIONS" });
  const optionLabels = extractResult.success
    ? ((extractResult.data as Record<string, unknown>)?.options as string[] ?? [])
    : [];

  if (optionLabels.length > 0) {
    const best = pickBestOption(desiredValue, optionLabels);
    if (best) {
      const winnerSelector = `#react-select-${questionId}-option-${best.index}`;
      const exists = await context.execute({
        type: "WAIT_FOR",
        target: winnerSelector,
        timeoutMs: 500,
      });
      if (exists.success) {
        await context.execute({
          type: "CLICK",
          target: { kind: "css", value: winnerSelector },
        });
        return true;
      }
    }
  }

  // Fallback: click first visible option element
  for (const optSel of OPTION_SELECTORS) {
    const exists = await context.execute({
      type: "WAIT_FOR",
      target: optSel,
      timeoutMs: 500,
    });
    if (exists.success) {
      await context.execute({ type: "CLICK", target: { kind: "css", value: optSel } });
      return true;
    }
  }

  return false;
}

/**
 * Check and click any required disclosure/consent checkboxes.
 * Returns the labels of checkboxes that were successfully checked.
 */
async function handleDisclosureCheckboxes(
  context: StateContext,
): Promise<string[]> {
  if (!context.execute) return [];
  const checked: string[] = [];

  for (const cbSelector of DISCLOSURE_CHECKBOX_SELECTORS) {
    const exists = await context.execute({
      type: "WAIT_FOR",
      target: cbSelector,
      timeoutMs: 500,
    });
    if (!exists.success) continue;

    const clickResult = await context.execute({
      type: "CHECK",
      selector: cbSelector,
      force: true,
    });
    if (clickResult.success) {
      checked.push(cbSelector);
    }
  }

  return checked;
}

// ---------------------------------------------------------------------------
// State handler
// ---------------------------------------------------------------------------

export const reviewDisclosuresState: StateHandler = {
  name: StateName.REVIEW_DISCLOSURES,

  entryCriteria:
    "Screening questions answered. Disclosure checkboxes, EEO fields, or " +
    "terms-of-service sections may be visible.",

  successCriteria:
    "Standard Greenhouse EEO dropdowns and any custom voluntary " +
    "self-identification fields have been answered. Required disclosure " +
    "checkboxes are checked.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    const filled: string[] = [];
    const skipped: string[] = [];

    // ── 1. Standard Greenhouse EEO fields ─────────────────────────────────
    // These fields (#gender, #hispanic_ethnicity, #veteran_status,
    // #disability_status) are optional on most Greenhouse forms but some
    // boards make them required. Check if they exist and are unfilled,
    // then fill them.
    for (const field of GREENHOUSE_STANDARD_EEO) {
      const exists = await context.execute({
        type: "WAIT_FOR",
        target: field.selector,
        timeoutMs: 300,
      });
      if (!exists.success) {
        skipped.push(field.label);
        continue;
      }

      const desiredValue =
        resolveDataKey(context.data, field.dataKey) ?? field.fallback;
      const ok = await fillEeoDropdown(context, field.selector, desiredValue, field.searchSeed);
      if (ok) {
        filled.push(field.label);
      } else {
        skipped.push(field.label);
      }

      await context.execute({
        type: "WAIT_FOR",
        target: SETTLE_SELECTOR,
        timeoutMs: INTER_DROPDOWN_SETTLE_MS,
      });
    }

    // ── 2. Custom EEO fields by numeric ID (Robinhood, etc.) ──────────────
    const extractResult = await context.execute({ type: "EXTRACT_FIELDS" });
    if (extractResult.success && extractResult.data) {
      const allFields = (extractResult.data as Record<string, unknown>).fields as Array<{
        selector: string;
        label: string | null;
        role: string | null;
        value: string | null;
        required: boolean;
      }>;

      // Only process numeric-ID comboboxes that are still empty (not already
      // filled by ANSWER_SCREENING_QUESTIONS)
      const customEeoFields = allFields.filter(
        (f) =>
          f.selector.match(/^\[id="\d+"\]$/) &&
          f.label &&
          f.role === "combobox" &&
          !f.value,
      );

      for (const field of customEeoFields) {
        const label = field.label!;
        const match = CUSTOM_EEO_PATTERNS.find((p) => p.pattern.test(label));
        if (!match) {
          skipped.push(label);
          continue;
        }

        const desiredValue =
          resolveDataKey(context.data, match.dataKey) ?? match.fallback;

        const ok = await fillEeoDropdown(context, field.selector, desiredValue, "");
        if (ok) filled.push(label);
        else skipped.push(label);

        await context.execute({
          type: "WAIT_FOR",
          target: SETTLE_SELECTOR,
          timeoutMs: INTER_DROPDOWN_SETTLE_MS,
        });
      }
    }

    // ── 3. Required disclosure / consent checkboxes ───────────────────────
    const checkedBoxes = await handleDisclosureCheckboxes(context);

    context.data.disclosuresFilled = filled;
    context.data.disclosuresSkipped = skipped;
    context.data.disclosureCheckboxes = checkedBoxes;

    return {
      outcome: "success",
      data: {
        disclosuresFilled: filled,
        disclosuresSkipped: skipped,
        disclosureCheckboxes: checkedBoxes,
      },
    };
  },
};
