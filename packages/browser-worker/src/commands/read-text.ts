import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeReadText(
  page: Page,
  cmd: { selector: string },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const text = await page.locator(cmd.selector).innerText();
    return {
      success: true,
      data: { text },
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
