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

const DEFAULT_TIMEOUT_MS = 60_000;

function buildEndpoint(): string {
  const auth = process.env["BRIGHT_DATA_AUTH"];
  if (!auth) {
    throw new BrokerError(
      "BRIGHT_DATA_AUTH environment variable is not set",
      BrokerErrorCode.MISSING_CREDENTIALS,
      RuntimeProvider.BRIGHT_DATA,
    );
  }
  return `wss://${auth}@brd.superproxy.io:9222`;
}

export async function allocateBrightDataSession(
  requirements: SessionRequirements,
): Promise<AllocatedSession> {
  const endpoint = buildEndpoint();
  const timeout = requirements.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const browser = await chromium.connectOverCDP(endpoint, { timeout });
    const context = await browser.newContext();
    const page = await context.newPage();

    return {
      id: randomUUID(),
      provider: RuntimeProvider.BRIGHT_DATA,
      browser,
      context,
      page,
      allocatedAt: new Date(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown allocation error";
    throw new BrokerError(
      `Bright Data session allocation failed: ${message}`,
      BrokerErrorCode.ALLOCATION_FAILED,
      RuntimeProvider.BRIGHT_DATA,
    );
  }
}

export async function releaseBrightDataSession(
  session: AllocatedSession,
): Promise<void> {
  try {
    await session.context.close();
    await session.browser.close();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown release error";
    throw new BrokerError(
      `Bright Data session release failed: ${message}`,
      BrokerErrorCode.RELEASE_FAILED,
      RuntimeProvider.BRIGHT_DATA,
    );
  }
}

export const brightDataConnector: ProviderConnector = {
  provider: RuntimeProvider.BRIGHT_DATA,
  allocate: allocateBrightDataSession,
  release: releaseBrightDataSession,
};
