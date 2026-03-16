import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeDomSnapshot(
  page: Page,
  cmd: { scope?: string },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const selector = cmd.scope ?? "body";
    const html = await page.locator(selector).innerHTML();
    return {
      success: true,
      data: { html, selector },
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
