import type { Browser, BrowserContext, Page } from "playwright";

export enum RuntimeProvider {
  BRIGHT_DATA = "bright_data",
  BROWSERBASE = "browserbase",
  /** Local Chromium launch — no credentials required. For dev and harness runs. */
  LOCAL = "local",
}

export interface SessionRequirements {
  provider?: RuntimeProvider;
  geo?: string;
  timeoutMs?: number;
  tags?: Record<string, string>;
  /**
   * When true the browser window is visible.
   * Only honoured by the LOCAL provider — remote providers are always headless.
   * Useful for debugging live-target runs.
   */
  headless?: boolean;
}

export interface AllocatedSession {
  id: string;
  provider: RuntimeProvider;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  allocatedAt: Date;
}

export class BrokerError extends Error {
  public readonly code: BrokerErrorCode;
  public readonly provider?: RuntimeProvider;

  constructor(
    message: string,
    code: BrokerErrorCode,
    provider?: RuntimeProvider,
  ) {
    super(message);
    this.name = "BrokerError";
    this.code = code;
    this.provider = provider;
  }
}

export enum BrokerErrorCode {
  ALLOCATION_FAILED = "ALLOCATION_FAILED",
  RELEASE_FAILED = "RELEASE_FAILED",
  PROVIDER_NOT_IMPLEMENTED = "PROVIDER_NOT_IMPLEMENTED",
  MISSING_CREDENTIALS = "MISSING_CREDENTIALS",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
}

export interface ProviderConnector {
  readonly provider: RuntimeProvider;
  allocate(requirements: SessionRequirements): Promise<AllocatedSession>;
  release(session: AllocatedSession): Promise<void>;
}
