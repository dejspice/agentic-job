import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

/**
 * Extract visible dropdown option labels from the DOM.
 *
 * Queries all elements matching React Select / ARIA option selectors,
 * reads their visible text, and returns a structured list.  This is
 * used instead of READ_TEXT on the listbox container because innerText
 * on React Select portals often returns empty.
 *
 * Uses page.evaluate() to read the DOM in a single browser round-trip
 * (same pattern as EXTRACT_FIELDS).
 */
export async function executeExtractOptions(
  page: Page,
): Promise<CommandResult> {
  const start = performance.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: string[] = await page.evaluate((): any => {
      const doc = (globalThis as any).document;
      const selectors = [
        '[role="option"]',
        '[id*="-option-"]',
        ".select__option",
      ];

      const seen = new Set();
      const labels: string[] = [];

      for (const sel of selectors) {
        const els = doc.querySelectorAll(sel);
        for (const el of Array.from(els) as any[]) {
          if (seen.has(el)) continue;
          seen.add(el);

          const text = (el.textContent ?? "").trim();
          if (text.length > 0) {
            labels.push(text);
          }
        }
      }

      return labels;
    });

    return {
      success: true,
      data: { options, count: options.length },
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - start),
    };
  }
}
