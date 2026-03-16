import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeNavigate(
  page: Page,
  cmd: { url: string },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    await page.goto(cmd.url, { waitUntil: "domcontentloaded" });
    return {
      success: true,
      data: { url: page.url() },
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
