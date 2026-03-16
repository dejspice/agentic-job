import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeType(
  page: Page,
  cmd: { selector: string; value: string; clearFirst?: boolean },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    if (cmd.clearFirst) {
      await page.fill(cmd.selector, "");
    }
    await page.fill(cmd.selector, cmd.value);
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
