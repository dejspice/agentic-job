import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeType(
  page: Page,
  cmd: { selector: string; value: string; clearFirst?: boolean; sequential?: boolean },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    if (cmd.sequential) {
      // Character-by-character typing with delays — required for React Select
      // comboboxes and autocomplete widgets that listen for individual keystrokes.
      // scrollIntoViewIfNeeded + click ensures the element is visible and
      // focused before typing (matches apply_agent.py _interact_combobox).
      const loc = page.locator(cmd.selector).nth(0);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      await loc.click();
      await page.waitForTimeout(400);
      await loc.pressSequentially(cmd.value, { delay: 40 });
    } else {
      if (cmd.clearFirst) {
        await page.fill(cmd.selector, "");
      }
      await page.fill(cmd.selector, cmd.value);
    }
    return {
      success: true,
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
