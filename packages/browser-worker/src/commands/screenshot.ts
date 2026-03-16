import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeScreenshot(
  page: Page,
  cmd: { fullPage?: boolean },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const buffer = await page.screenshot({
      fullPage: cmd.fullPage ?? false,
      type: "png",
    });
    return {
      success: true,
      data: { buffer, byteLength: buffer.byteLength },
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
