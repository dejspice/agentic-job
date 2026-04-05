import type { Page } from "playwright";
import type { CommandResult } from "@dejsol/core";

export async function executeUpload(
  page: Page,
  cmd: { selector: string; filePath: string; triggerSelector?: string },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    if (cmd.triggerSelector) {
      // Filechooser pattern (ported from apply_agent.py):
      // scroll the trigger into view, click it, and intercept the native
      // file dialog.  This is the only approach that reliably registers
      // uploads on React-managed upload widgets (modern Greenhouse).
      const trigger = page.locator(cmd.triggerSelector).nth(0);
      await trigger.scrollIntoViewIfNeeded({ timeout: 5000 });
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 10000 }),
        trigger.click(),
      ]);
      await fileChooser.setFiles(cmd.filePath);
    } else {
      const input = page.locator(cmd.selector);
      await input.setInputFiles(cmd.filePath);
      await input.dispatchEvent("change");
    }
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
