import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeCheck(
  page: Page,
  cmd: { selector: string; force?: boolean },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    await page.locator(cmd.selector).check({ force: cmd.force });
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
