import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";
import type { CommandExecutor } from "../types.js";
import { pickBestOption } from "../screening/option-matcher.js";

interface GreenhouseFieldDef {
  /**
   * CSS selectors in priority order.
   * The first selector that passes a 200 ms WAIT_FOR check is used for TYPE.
   * Covers id-based (canonical), name-based (common live-site variant), and
   * type/name-contains fallbacks.
   */
  selectors: readonly string[];
  /** Dot-path into context.data for the candidate value. */
  dataKey: string;
  /**
   * When false, absence of a value in the data bag does NOT count as a failure.
   * The field is silently skipped rather than added to failedFields.
   * Phone is optional on many Greenhouse boards.
   */
  required: boolean;
  /**
   * Interaction strategy:
   *   "type"                     — plain text fill (default)
   *   "react-select"             — standard React Select combobox
   *   "native-select"            — native HTML <select> dropdown
   *   "location-autocomplete"    — async React Select, clicks first suggestion
   *   "education-autocomplete"   — async React Select, scores options before clicking
   */
  interaction?: "type" | "react-select" | "native-select" | "location-autocomplete" | "education-autocomplete";
}

/**
 * Greenhouse personal-info field definitions with multi-selector fallback.
 *
 * Priority order within each selectors array:
 *   1. Canonical ID (#field_name)
 *   2. Canonical name (job_application[field_name])
 *   3. name*= partial-match
 *   4. id*= partial-match / type-based
 */
const GREENHOUSE_FIELDS: readonly GreenhouseFieldDef[] = [
  {
    selectors: [
      "#first_name",
      'input[name="job_application[first_name]"]',
      'input[name*="first_name"]',
      'input[id*="first_name"]',
    ],
    dataKey: "candidate.firstName",
    required: true,
  },
  {
    selectors: [
      "#last_name",
      'input[name="job_application[last_name]"]',
      'input[name*="last_name"]',
      'input[id*="last_name"]',
    ],
    dataKey: "candidate.lastName",
    required: true,
  },
  {
    selectors: [
      "#preferred_name",
      'input[name="job_application[preferred_name]"]',
      'input[name*="preferred_name"]',
    ],
    dataKey: "candidate.firstName",
    required: false,
  },
  {
    selectors: [
      "#email",
      'input[name="job_application[email]"]',
      'input[type="email"]',
      'input[name*="email"]',
    ],
    dataKey: "candidate.email",
    required: true,
  },
  {
    selectors: [
      "#phone",
      'input[name="job_application[phone]"]',
      'input[type="tel"]',
      'input[name*="phone"]',
    ],
    dataKey: "candidate.phone",
    required: false,
  },
  {
    selectors: [
      "#country",
      'input[id="country"]',
      'input[name*="country"]',
    ],
    dataKey: "candidate.country",
    required: false,
    interaction: "react-select",
  },
  {
    selectors: [
      "#candidate-location",
      "#job_application_location",
      'input[role="combobox"][id*="location"]',
      'input[id*="location"]',
    ],
    dataKey: "candidate.city",
    required: false,
    interaction: "location-autocomplete",
  },

  // ── Education section (Greenhouse standard) ────────────────────────
  // Some boards require at least one education entry. The --0 suffix
  // indicates the first (and usually only) education row.
  {
    selectors: ["#school--0", 'input[id="school--0"]'],
    dataKey: "candidate.school",
    required: false,
    interaction: "education-autocomplete",
  },
  {
    selectors: ["#degree--0", 'input[id="degree--0"]'],
    dataKey: "candidate.degree",
    required: false,
    interaction: "react-select",
  },
  {
    selectors: ["#discipline--0", 'input[id="discipline--0"]'],
    dataKey: "candidate.discipline",
    required: false,
    interaction: "react-select",
  },
  {
    selectors: ["#start-year--0", 'input[id="start-year--0"]'],
    dataKey: "candidate.eduStartYear",
    required: false,
  },
  {
    selectors: ["#end-year--0", 'input[id="end-year--0"]'],
    dataKey: "candidate.eduEndYear",
    required: false,
  },
  {
    selectors: ["#start-month--0", 'select[id="start-month--0"]'],
    dataKey: "candidate.eduStartMonth",
    required: false,
    interaction: "react-select",
  },
  {
    selectors: ["#end-month--0", 'select[id="end-month--0"]'],
    dataKey: "candidate.eduEndMonth",
    required: false,
    interaction: "react-select",
  },
];

/**
 * Fill a Greenhouse location autocomplete field.
 *
 * Greenhouse #candidate-location is an async React Select that fetches
 * location suggestions from a server endpoint after typing.  The suggestions
 * are standard React Select option elements but only appear after a
 * network round-trip.
 *
 * Strategy:
 *   1. Click + type the city name character-by-character (triggers async fetch)
 *   2. Wait up to 5s for react-select option elements to appear
 *   3. Click the first matching suggestion
 *   4. If no suggestions appear, press ArrowDown + Enter as a commit fallback
 */
async function fillLocationAutocomplete(
  execute: CommandExecutor,
  selector: string,
  value: string,
): Promise<boolean> {
  const fieldId = selector.replace(/^#/, "");
  const specificOptionPrefix = `[id^="react-select-${fieldId}-option"]`;

  const OPTION_SELECTORS: readonly string[] = [
    specificOptionPrefix,
    "[id*='-option-']",
    "[role='option']:not([id^='iti-'])",
    ".select__option",
    ".pac-item",
  ];

  // Type the city name to trigger the async suggestion fetch.
  // Use only the city portion (before any comma) — Greenhouse's location
  // search returns better results for bare city names than "City, ST".
  const seed = value.split(",")[0]!.trim();
  await execute({ type: "TYPE", selector, value: seed, sequential: true });

  // Wait longer than standard React Select — the suggestion fetch is async.
  let optionFound = false;
  for (const optSel of OPTION_SELECTORS) {
    const optWait = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 5000 });
    if (optWait.success) {
      optionFound = true;

      // Read and click the first option for this specific field
      const firstOpt = `#react-select-${fieldId}-option-0`;
      const firstExists = await execute({ type: "WAIT_FOR", target: firstOpt, timeoutMs: 1000 });
      if (firstExists.success) {
        await execute({ type: "CLICK", target: { kind: "css", value: firstOpt } });
        return true;
      }

      // Fallback: click the generic first option
      await execute({ type: "CLICK", target: { kind: "css", value: optSel } });
      return true;
    }
  }

  if (!optionFound) {
    // No suggestions appeared. Retry with the full "City, State" value —
    // some Greenhouse location fields have a different search backend
    // that works better with the complete string.
    await execute({ type: "TYPE", selector, value: "", clearFirst: true });
    await execute({ type: "TYPE", selector, value: value, sequential: true });

    // Wait one more time for async suggestions
    for (const optSel of OPTION_SELECTORS) {
      const retryWait = await execute({ type: "WAIT_FOR", target: optSel, timeoutMs: 5000 });
      if (retryWait.success) {
        const firstOpt = `#react-select-${fieldId}-option-0`;
        const firstExists = await execute({ type: "WAIT_FOR", target: firstOpt, timeoutMs: 1000 });
        if (firstExists.success) {
          await execute({ type: "CLICK", target: { kind: "css", value: firstOpt } });
          return true;
        }
        await execute({ type: "CLICK", target: { kind: "css", value: optSel } });
        return true;
      }
    }
  }

  return optionFound;
}

/**
 * Fill a Greenhouse education autocomplete field (school, etc.).
 *
 * Unlike location-autocomplete which clicks the first suggestion,
 * this reads all visible options and scores them against the desired
 * value using pickBestOption. Handles differences like:
 *   "University of Texas at Dallas" vs "University of Texas - Dallas"
 */
async function fillEducationAutocomplete(
  execute: CommandExecutor,
  selector: string,
  value: string,
): Promise<boolean> {
  const fieldId = selector.replace(/^#/, "");

  // Normalize the value: strip "at" and common noise so "University of Texas at Dallas"
  // becomes a seed like "University of Texas Dallas" which returns relevant suggestions
  const normalized = value.replace(/\b(at|the|of)\b/gi, "").replace(/\s+/g, " ").trim();
  const seed = normalized.substring(0, Math.min(normalized.length, 30));

  // Type the seed and wait for the autocomplete menu to appear
  await execute({ type: "TYPE", selector, value: seed, sequential: true });

  const MENU_SELECTORS: readonly string[] = [
    "[class*='select__menu']",
    "[id*='-option-']",
    "[role='option']",
    ".select__option",
    "[role='listbox']",
  ];

  let menuFound = false;
  for (const sel of MENU_SELECTORS) {
    const wait = await execute({ type: "WAIT_FOR", target: sel, timeoutMs: 5000 });
    if (wait.success) { menuFound = true; break; }
  }

  if (menuFound) {
    // Try clicking by semantic label (text content match in the dropdown)
    // This works for custom select components that render options as plain divs
    const textClick = await execute({ type: "CLICK", target: { kind: "semantic", label: value } });
    if (textClick.success) return true;

    // Try EXTRACT_OPTIONS + scoring + semantic click
    const extractResult = await execute({ type: "EXTRACT_OPTIONS" });
    const opts = extractResult.success
      ? ((extractResult.data as Record<string, unknown>)?.options as string[] ?? [])
      : [];
    if (opts.length > 0) {
      const normalizedValue = value.replace(/-/g, " ").replace(/\b(at|the)\b/gi, "").replace(/\s+/g, " ").trim();
      const best = pickBestOption(normalizedValue, opts.map(l => l.replace(/-/g, " ").replace(/\b(at|the)\b/gi, "").replace(/\s+/g, " ").trim()));
      if (best) {
        const optClick = await execute({ type: "CLICK", target: { kind: "semantic", label: opts[best.index] } });
        if (optClick.success) return true;
      }
    }

    // Try react-select ID-based click
    const firstOpt = `#react-select-${fieldId}-option-0`;
    const firstExists = await execute({ type: "WAIT_FOR", target: firstOpt, timeoutMs: 500 });
    if (firstExists.success) {
      await execute({ type: "CLICK", target: { kind: "css", value: firstOpt } });
      return true;
    }
  }

  // Last resort: clear, type full value, and press Tab to commit
  await execute({ type: "TYPE", selector, value: "", clearFirst: true });
  await execute({ type: "TYPE", selector, value, sequential: true });
  // Brief wait for async suggestions, then Tab to accept the top suggestion
  await execute({ type: "WAIT_FOR", target: "[class*='select__menu']", timeoutMs: 3000 });
  await execute({ type: "TYPE", selector, value: "\t" });

  return true;
}

const MONTH_TO_NUMBER: Record<string, string> = {
  january: "1", february: "2", march: "3", april: "4", may: "5", june: "6",
  july: "7", august: "8", september: "9", october: "10", november: "11", december: "12",
  jan: "1", feb: "2", mar: "3", apr: "4", jun: "6", jul: "7", aug: "8", sep: "9", oct: "10", nov: "11", dec: "12",
};

function resolveValue(
  data: Record<string, unknown>,
  dotPath: string,
): string | undefined {
  const parts = dotPath.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export const fillRequiredFieldsState: StateHandler = {
  name: StateName.FILL_REQUIRED_FIELDS,

  entryCriteria:
    "Parsed profile validation is complete. A DOM snapshot of the form is available. Required empty or mismatched fields have been identified.",

  successCriteria:
    "All required fields (name, email, etc.) are filled with correct values sourced from the candidate profile. Optional absent fields are skipped.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "fill-fields-before");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    const filledFields: string[] = [];
    const failedFields: string[] = [];

    for (const field of GREENHOUSE_FIELDS) {
      const value = resolveValue(context.data, field.dataKey);

      if (!value) {
        if (field.required) {
          failedFields.push(field.selectors[0]!);
        }
        continue;
      }

      let filled = false;

      for (const selector of field.selectors) {
        // Use a longer timeout for core fields — some Greenhouse boards
        // render the form lazily after JavaScript hydration.
        const waitMs = field.required ? 1500 : 200;
        const checkResult = await context.execute({
          type: "WAIT_FOR",
          target: selector,
          timeoutMs: waitMs,
        });
        if (!checkResult.success) continue;

        if (field.interaction === "native-select") {
          let selectOk = false;
          const selectResult = await context.execute({ type: "SELECT", selector, value });
          selectOk = selectResult.success;
          if (!selectOk) {
            const numericMonth = MONTH_TO_NUMBER[value.toLowerCase()];
            if (numericMonth) {
              const retryResult = await context.execute({ type: "SELECT", selector, value: numericMonth });
              selectOk = retryResult.success;
            }
          }
          if (selectOk) {
            filledFields.push(selector);
            filled = true;
            break;
          }
          continue;
        }

        if (field.interaction === "education-autocomplete") {
          const eduFilled = await fillEducationAutocomplete(context.execute, selector, value);
          if (eduFilled) {
            filledFields.push(selector);
            filled = true;
            break;
          }
          continue;
        }

        if (field.interaction === "location-autocomplete") {
          const locFilled = await fillLocationAutocomplete(context.execute, selector, value);
          if (locFilled) {
            filledFields.push(selector);
            filled = true;
            break;
          }
          continue;
        }

        if (field.interaction === "react-select") {
          // React Select / combobox interaction ported from apply_agent.py:
          // 1. Click to open the dropdown
          // 2. Type sequentially (char by char) to trigger filtering
          // 3. Wait for dropdown options to appear
          // 4. Click the first matching option (fallback: ArrowDown + Enter)
          const clickResult = await context.execute({
            type: "CLICK",
            target: { kind: "css", value: selector },
          });
          if (!clickResult.success) continue;

          const typeResult = await context.execute({
            type: "TYPE",
            selector,
            value,
            sequential: true,
          });
          if (!typeResult.success) continue;

          // Wait for dropdown option suggestions to appear.
          // Includes React Select, ARIA options, and Google Places autocomplete
          // selectors (ported from apply_agent.py OPTION_SELECTORS).
          const OPTION_SELECTORS = [
            "[id*='-option-']",
            "[role='option']",
            ".select__option",
            ".pac-item",
            "[class*='suggestion']",
            "[class*='autocomplete'] li",
          ];
          let optionClicked = false;
          for (const optSel of OPTION_SELECTORS) {
            const optWait = await context.execute({
              type: "WAIT_FOR",
              target: optSel,
              timeoutMs: 3000,
            });
            if (optWait.success) {
              await context.execute({
                type: "CLICK",
                target: { kind: "css", value: optSel },
              });
              optionClicked = true;
              break;
            }
          }

          filledFields.push(selector);
          filled = true;
          break;
        } else {
          const typeResult = await context.execute({
            type: "TYPE",
            selector,
            value,
            clearFirst: true,
          });

          if (typeResult.success) {
            filledFields.push(selector);
            filled = true;
            break;
          }
        }
      }

      if (!filled && field.required) {
        failedFields.push(field.selectors[0]!);
      }
    }

    // ── Retry pass for required fields that failed on first attempt ───
    // Some Greenhouse boards hydrate form fields asynchronously after
    // the initial page render.  A short pause + second attempt with a
    // longer timeout catches late-loading fields.
    if (failedFields.length > 0) {
      const retryTargets = GREENHOUSE_FIELDS.filter(
        (f) => f.required && failedFields.includes(f.selectors[0]!),
      );

      if (retryTargets.length > 0) {
        // Wait for late-loading fields
        await context.execute({ type: "WAIT_FOR", target: "body", timeoutMs: 2000 });

        const retried: string[] = [];
        for (const field of retryTargets) {
          const value = resolveValue(context.data, field.dataKey);
          if (!value) continue;

          for (const selector of field.selectors) {
            const checkResult = await context.execute({
              type: "WAIT_FOR",
              target: selector,
              timeoutMs: 3000,
            });
            if (!checkResult.success) continue;

            const typeResult = await context.execute({
              type: "TYPE",
              selector,
              value,
              clearFirst: true,
            });
            if (typeResult.success) {
              retried.push(field.selectors[0]!);
              filledFields.push(selector);
              break;
            }
          }
        }

        for (const sel of retried) {
          const idx = failedFields.indexOf(sel);
          if (idx !== -1) failedFields.splice(idx, 1);
        }
      }
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("dom_snapshot", "fill-fields-after");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    context.data.filledFields = filledFields;
    context.data.failedFields = failedFields;

    if (failedFields.length > 0) {
      if (context.captureArtifact) {
        const ref = await context.captureArtifact("screenshot", "fill-fields-failure");
        context.data.artifacts = context.data.artifacts ?? [];
        (context.data.artifacts as unknown[]).push(ref);
      }
      return {
        outcome: "failure",
        error: `Failed to fill required fields: ${failedFields.join(", ")}`,
        data: { filledFields, failedFields },
      };
    }

    return { outcome: "success", data: { filledFields } };
  },
};
