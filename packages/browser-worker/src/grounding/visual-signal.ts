import type { Page } from "playwright";

export interface VisualSignalResult {
  screenshotBuffer: Buffer;
  annotations: unknown[];
}

export interface VisualSignalProvider {
  capture(page: Page, fullPage?: boolean): Promise<VisualSignalResult>;
}

export const visualSignalProvider: VisualSignalProvider = {
  async capture(page: Page, fullPage = false): Promise<VisualSignalResult> {
    const screenshotBuffer = await page.screenshot({
      fullPage,
      type: "png",
    });

    return {
      screenshotBuffer,
      annotations: [],
    };
  },
};
