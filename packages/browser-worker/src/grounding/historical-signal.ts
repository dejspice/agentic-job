export interface HistoricalPrior {
  fieldMappings: Record<string, string>;
  knownFlowSteps: string[];
  successRate: number | null;
}

export interface HistoricalSignalProvider {
  lookup(domain: string, atsType: string): Promise<HistoricalPrior | null>;
}

export const historicalSignalProvider: HistoricalSignalProvider = {
  async lookup(
    _domain: string,
    _atsType: string,
  ): Promise<HistoricalPrior | null> {
    return null;
  },
};
