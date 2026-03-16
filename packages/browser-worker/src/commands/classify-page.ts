import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeClassifyPage(
  page: Page,
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const url = page.url();
    const title = await page.title();

    return {
      success: true,
      data: { url, title, classification: null },
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
