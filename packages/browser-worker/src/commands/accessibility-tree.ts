import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeAccessibilityTree(
  page: Page,
  cmd: { scope?: string },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const locator = cmd.scope ? page.locator(cmd.scope) : page.locator("body");
    const snapshot = await locator.ariaSnapshot();

    return {
      success: true,
      data: { snapshot },
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
