import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export interface ExtractedField {
  selector: string;
  type: string;
  name: string | null;
  label: string | null;
  required: boolean;
  value: string | null;
}

export async function executeExtractFields(
  page: Page,
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const fields: ExtractedField[] = await page.evaluate(
      /* executed in browser context */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (): any[] => {
      const inputs: any[] = Array.from(
        (globalThis as any).document.querySelectorAll("input, select, textarea"),
      );

      return inputs
        .filter((el: any) => {
          // Skip hidden framework validation shims (e.g. React Select
          // requiredInput elements) — they are aria-hidden, not interactive,
          // and have no id/name.  Counting them as real fields causes false
          // positives in the pre-submit required-field sweep.
          if (el.getAttribute("aria-hidden") === "true") return false;
          if (el.tabIndex === -1 && !el.id && !el.name) return false;
          if (el.type === "hidden") return false;
          return true;
        })
        .map((el: any) => {
          const id = el.id ? `#${el.id}` : "";
          const name = el.name ? `[name="${el.name}"]` : "";
          const selector = id || name || el.tagName.toLowerCase();

          let label: string | null = null;
          if (el.id) {
            const labelEl = (globalThis as any).document.querySelector(`label[for="${el.id}"]`);
            if (labelEl) label = (labelEl.textContent ?? "").trim() || null;
          }
          if (!label && el.closest("label")) {
            label = (el.closest("label").textContent ?? "").trim() || null;
          }

          return {
            selector,
            type: el.type || el.tagName.toLowerCase(),
            name: el.name || null,
            label,
            required: Boolean(el.required),
            value: el.value || null,
          };
        });
    },
    );

    return {
      success: true,
      data: { fields, count: fields.length },
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
