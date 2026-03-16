import type { Page } from "playwright";

export interface DomSignalResult {
  labels: string[];
  roles: Array<{ role: string; name: string }>;
  requiredFields: string[];
  placeholders: Record<string, string>;
  raw?: string;
}

export interface DomSignalProvider {
  extract(page: Page, scope?: string): Promise<DomSignalResult>;
}

export const domSignalProvider: DomSignalProvider = {
  async extract(page: Page, scope?: string): Promise<DomSignalResult> {
    const locator = scope ? page.locator(scope) : page.locator("body");
    const snapshot = await locator.ariaSnapshot();

    const labels: string[] = [];
    const roles: Array<{ role: string; name: string }> = [];

    for (const line of snapshot.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("-")) continue;
      const match = /^(\w+)\s+"([^"]*)"/.exec(trimmed);
      if (match) {
        roles.push({ role: match[1], name: match[2] });
        labels.push(match[2]);
      }
    }

    return {
      labels,
      roles,
      requiredFields: [],
      placeholders: {},
      raw: snapshot,
    };
  },
};
