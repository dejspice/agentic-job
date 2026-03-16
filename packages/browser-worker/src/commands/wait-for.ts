import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeWaitFor(
  page: Page,
  cmd: { target: string | (() => boolean); timeoutMs: number },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    if (typeof cmd.target === "string") {
      await page.waitForSelector(cmd.target, { timeout: cmd.timeoutMs });
    } else {
      await page.waitForFunction(cmd.target, undefined, {
        timeout: cmd.timeoutMs,
      });
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
