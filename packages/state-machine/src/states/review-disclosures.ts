import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";
import { pickBestOption } from "../screening/option-matcher.js";

// ---------------------------------------------------------------------------
// EEO / voluntary self-identification field definitions
// ---------------------------------------------------------------------------

/**
 * Standard Greenhouse EEO field IDs present on virtually every Greenhouse
 * board.  These use stable selectors regardless of company.
 */
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
    searchSeed: "Man",
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

/**
 * Label patterns for Robinhood-style custom EEO dropdowns that use numeric
 * IDs (#1255 etc.).  Matched against labels found by EXTRACT_FIELDS.
 */
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
 * Fill a React Select EEO dropdown.
 *
 * Clicks the visible .select__control wrapper (not the hidden input) to open
 * the dropdown without triggering scroll-into-view on the input element.
 * Then reads all visible options, scores against the desired value, and
 * clicks the best match by its stable React Select option ID.
 */
async function fillEeoDropdown(
  context: StateContext,
  selector: string,
  desiredValue: string,
  _searchSeed: string,
): Promise<boolean> {
  if (!context.execute) return false;

  const questionId = selector.replace(/^#/, "");

  // Click the visible dropdown control (the box the user sees) to open
  // the menu.  The control is a sibling of the hidden combobox input inside
  // the React Select container.  This avoids the scroll/click/type dance
  // that the TYPE sequential path triggers on the hidden input.
  // Click the visible .select__control box to open the dropdown menu.
  // The DOM structure is: label[for=id] ~ .select-shell ... .select__control
  // Never use TYPE sequential — that triggers scrollIntoView thrashing.
  // Never click the raw combobox input — it's hidden behind
  // .select__control and causes scrollIntoView thrashing.
  // Try the control wrapper, then the dropdown toggle button.
  const controlSelectors = [
    `label[for="${questionId}"] ~ .select-shell .select__control`,
    `#${questionId}-label ~ .select-shell .select__control`,
    `label[for="${questionId}"] ~ .select-shell .select__indicators button`,
  ];

  let opened = false;
  for (const clickTarget of controlSelectors) {
    const exists = await context.execute({
      type: "WAIT_FOR",
      target: clickTarget,
      timeoutMs: 300,
    });
    if (exists.success) {
      await context.execute({ type: "CLICK", target: { kind: "css", value: clickTarget } });
      opened = true;
      break;
    }
  }
  if (!opened) return false;

  // Wait for options to render
  const firstOptSelector = `#react-select-${questionId}-option-0`;
  const optWait = await context.execute({
    type: "WAIT_FOR",
    target: firstOptSelector,
    timeoutMs: 3000,
  });
  if (!optWait.success) return false;

  // Extract all visible options in a single browser round-trip
  const extractResult = await context.execute({ type: "EXTRACT_OPTIONS" });
  const optionLabels = extractResult.success
    ? ((extractResult.data as Record<string, unknown>)?.options as string[] ?? [])
    : [];

  if (optionLabels.length > 0) {
    const best = pickBestOption(desiredValue, optionLabels);
    if (best) {
      const winnerSelector = `#react-select-${questionId}-option-${best.index}`;
      await context.execute({ type: "CLICK", target: { kind: "css", value: winnerSelector } });
      return true;
    }
  }

  // Fallback: click first visible option
  await context.execute({ type: "CLICK", target: { kind: "css", value: firstOptSelector } });
  return true;
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
    for (const field of GREENHOUSE_STANDARD_EEO) {
      const exists = await context.execute({
        type: "WAIT_FOR",
        target: field.selector,
        timeoutMs: 500,
      });
      if (!exists.success) continue;

      const desiredValue =
        resolveDataKey(context.data, field.dataKey) ?? field.fallback;

      const ok = await fillEeoDropdown(context, field.selector, desiredValue, field.searchSeed);
      if (ok) filled.push(field.label);
      else skipped.push(field.label);
    }

    // ── 2. Custom EEO fields by numeric ID (Robinhood, etc.) ──────────────
    // Extract all fields and find any unmatched numeric-ID comboboxes that
    // correspond to EEO patterns.
    const extractResult = await context.execute({ type: "EXTRACT_FIELDS" });
    if (extractResult.success && extractResult.data) {
      const allFields = (extractResult.data as Record<string, unknown>).fields as Array<{
        selector: string;
        label: string | null;
        role: string | null;
        value: string | null;
        required: boolean;
      }>;

      const customEeoFields = allFields.filter(
        (f) =>
          f.selector.match(/^#\d+$/) &&
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
      }
    }

    context.data.disclosuresFilled = filled;
    context.data.disclosuresSkipped = skipped;

    return {
      outcome: "success",
      data: { disclosuresFilled: filled, disclosuresSkipped: skipped },
    };
  },
};
