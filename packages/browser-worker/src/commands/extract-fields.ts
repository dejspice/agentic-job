import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export interface ExtractedField {
  selector: string;
  type: string;
  name: string | null;
  label: string | null;
  required: boolean;
  value: string | null;
  maxLength: number | null;
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
          let id = "";
          if (el.id) {
            // Use attribute selector for IDs that are invalid as CSS
            // hash selectors: numeric-only, or containing brackets/special
            // characters (e.g. Greenhouse checkbox IDs "question_XXX[]_YYY").
            id = /^\d|[\[\](){}#.+~>:,]/.test(el.id)
              ? `[id="${el.id}"]`
              : `#${el.id}`;
          }
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

          const role = el.getAttribute("role") || null;

          // React Select combobox inputs always have empty .value even when
          // an option is selected (React manages the state, not the DOM).
          // The selected text lives in a sibling element of the input's
          // container.  Walk up to the value-container / control wrapper
          // and query for the single-value display element.
          //
          // Greenhouse DOM structure (new Remix-based boards):
          //   .select__value-container
          //     .select__single-value   ← selected text here
          //     .select__input-container
          //       input[role=combobox]   ← el is here, value="" always
          let fieldValue = el.value || null;

          // Checkboxes and radios: value attr is always set (the option
          // value) but the field is only "filled" when checked.
          if ((el.type === "checkbox" || el.type === "radio") && !el.checked) {
            fieldValue = null;
          }

          if (role === "combobox" && !fieldValue) {
            const inputContainer = el.closest(".select__input-container");
            const valueContainer = inputContainer
              ? inputContainer.parentElement
              : el.closest("[class*='value-container']")
                ?? el.closest("[class*='ValueContainer']")
                ?? el.parentElement?.parentElement;
            const searchRoots = [
              valueContainer,
              valueContainer?.parentElement,
              el.parentElement,
            ];
            for (const root of searchRoots) {
              if (!root) continue;
              const sv =
                root.querySelector(".select__single-value")
                ?? root.querySelector("[class*='singleValue']")
                ?? root.querySelector("[class*='single-value']");
              if (sv) {
                const text = (sv.textContent ?? "").trim();
                if (text) { fieldValue = text; break; }
              }
            }
          }

          const rawMax = el.getAttribute("maxlength");
          const maxLength = rawMax ? parseInt(rawMax, 10) : null;

          return {
            selector,
            type: el.type || el.tagName.toLowerCase(),
            role,
            name: el.name || null,
            label,
            required: Boolean(el.required) || el.getAttribute("aria-required") === "true",
            value: fieldValue,
            maxLength: maxLength && !isNaN(maxLength) ? maxLength : null,
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
