/**
 * Local Chromium provider for BrowserBroker.
 *
 * Allocates a browser session using Playwright's built-in Chromium binary —
 * no remote endpoint, no credentials required.
 *
 * Intended for:
 *   - Local development
 *   - Live-target execution harness runs where remote providers are unavailable
 *   - CI environments where only a local browser is needed
 *
 * `headless` defaults to true.  Pass `requirements.headless = false` to open
 * a visible browser window (useful for debugging live Greenhouse runs).
 */

import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import {
  RuntimeProvider,
  BrokerError,
  BrokerErrorCode,
  type AllocatedSession,
  type SessionRequirements,
  type ProviderConnector,
} from "./types.js";

export async function allocateLocalSession(
  requirements: SessionRequirements,
): Promise<AllocatedSession> {
  const headless = requirements.headless ?? true;

  try {
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    return {
      id: randomUUID(),
      provider: RuntimeProvider.LOCAL,
      browser,
      context,
      page,
      allocatedAt: new Date(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown allocation error";
    throw new BrokerError(
      `Local session allocation failed: ${message}`,
      BrokerErrorCode.ALLOCATION_FAILED,
      RuntimeProvider.LOCAL,
    );
  }
}

export async function releaseLocalSession(
  session: AllocatedSession,
): Promise<void> {
  try {
    await session.context.close();
    await session.browser.close();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown release error";
    throw new BrokerError(
      `Local session release failed: ${message}`,
      BrokerErrorCode.RELEASE_FAILED,
      RuntimeProvider.LOCAL,
    );
  }
}

export const localConnector: ProviderConnector = {
  provider: RuntimeProvider.LOCAL,
  allocate: allocateLocalSession,
  release: releaseLocalSession,
};
