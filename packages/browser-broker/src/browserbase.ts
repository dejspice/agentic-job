import {
  RuntimeProvider,
  BrokerError,
  BrokerErrorCode,
  type AllocatedSession,
  type SessionRequirements,
  type ProviderConnector,
} from "./types.js";

export async function allocateBrowserbaseSession(
  _requirements: SessionRequirements,
): Promise<AllocatedSession> {
  throw new BrokerError(
    "Browserbase provider is not yet implemented",
    BrokerErrorCode.PROVIDER_NOT_IMPLEMENTED,
    RuntimeProvider.BROWSERBASE,
  );
}

export async function releaseBrowserbaseSession(
  _session: AllocatedSession,
): Promise<void> {
  throw new BrokerError(
    "Browserbase provider is not yet implemented",
    BrokerErrorCode.PROVIDER_NOT_IMPLEMENTED,
    RuntimeProvider.BROWSERBASE,
  );
}

export const browserbaseConnector: ProviderConnector = {
  provider: RuntimeProvider.BROWSERBASE,
  allocate: allocateBrowserbaseSession,
  release: releaseBrowserbaseSession,
};
