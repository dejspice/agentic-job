import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeSelect(
  page: Page,
  cmd: { selector: string; value: string },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const selected = await page.selectOption(cmd.selector, cmd.value);
    return {
      success: true,
      data: { selected },
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
