import type { Page } from "playwright";
import type { CommandResult, SelectorTarget } from "@dejsol/core";

async function resolveAndClick(
  page: Page,
  target: SelectorTarget,
  force?: boolean,
): Promise<void> {
  switch (target.kind) {
    case "css":
      await page.click(target.value, { force });
      break;
    case "coordinates":
      await page.mouse.click(target.x, target.y);
      break;
    case "semantic":
      await page.getByRole("button", { name: target.label }).or(
        page.getByRole("link", { name: target.label }),
      ).or(
        page.getByRole("option", { name: target.label }),
      ).or(
        page.locator(".select__menu-list").getByText(target.label, { exact: true }),
      ).or(
        page.getByText(target.label, { exact: true }),
      ).or(
        page.getByText(target.label),
      ).first().click({ force });
      break;
  }
}

export async function executeClick(
  page: Page,
  cmd: { target: SelectorTarget; force?: boolean },
): Promise<CommandResult> {
  const start = performance.now();
  try {
    await resolveAndClick(page, cmd.target, cmd.force);
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
