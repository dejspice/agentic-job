import {
  RuntimeProvider,
  BrokerError,
  BrokerErrorCode,
  type AllocatedSession,
  type SessionRequirements,
  type ProviderConnector,
} from "./types.js";
import { brightDataConnector } from "./bright-data.js";
import { browserbaseConnector } from "./browserbase.js";

const DEFAULT_PROVIDER = RuntimeProvider.BRIGHT_DATA;

const connectors: Record<RuntimeProvider, ProviderConnector> = {
  [RuntimeProvider.BRIGHT_DATA]: brightDataConnector,
  [RuntimeProvider.BROWSERBASE]: browserbaseConnector,
};

export class BrowserBroker {
  private readonly activeSessions = new Map<string, AllocatedSession>();

  async allocateSession(
    requirements: SessionRequirements = {},
  ): Promise<AllocatedSession> {
    const provider = requirements.provider ?? DEFAULT_PROVIDER;
    const connector = connectors[provider];

    if (!connector) {
      throw new BrokerError(
        `No connector registered for provider: ${provider}`,
        BrokerErrorCode.PROVIDER_NOT_IMPLEMENTED,
        provider,
      );
    }

    const session = await connector.allocate(requirements);
    this.activeSessions.set(session.id, session);
    return session;
  }

  async releaseSession(session: AllocatedSession): Promise<void> {
    const connector = connectors[session.provider];

    if (!connector) {
      throw new BrokerError(
        `No connector registered for provider: ${session.provider}`,
        BrokerErrorCode.PROVIDER_NOT_IMPLEMENTED,
        session.provider,
      );
    }

    try {
      await connector.release(session);
    } finally {
      this.activeSessions.delete(session.id);
    }
  }

  getActiveSession(id: string): AllocatedSession | undefined {
    return this.activeSessions.get(id);
  }

  get activeSessionCount(): number {
    return this.activeSessions.size;
  }
}
