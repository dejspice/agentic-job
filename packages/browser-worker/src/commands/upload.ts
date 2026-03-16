import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeUpload(
  page: Page,
  cmd: { selector: string; filePath: string },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    const input = page.locator(cmd.selector);
    await input.setInputFiles(cmd.filePath);
    return {
      success: true,
      data: { filePath: cmd.filePath },
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
