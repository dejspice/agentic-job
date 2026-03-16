import type { Page } from "playwright";

export interface CapturedArtifact {
  type: "screenshot" | "dom_snapshot" | "har";
  label: string;
  timestamp: Date;
  data: Buffer | string;
}

export interface ArtifactStore {
  save(runId: string, artifact: CapturedArtifact): Promise<string>;
}

export async function captureScreenshot(
  page: Page,
  label: string,
  fullPage = false,
): Promise<CapturedArtifact> {
  const buffer = await page.screenshot({ fullPage, type: "png" });
  return {
    type: "screenshot",
    label,
    timestamp: new Date(),
    data: buffer,
  };
}

export async function captureDomSnapshot(
  page: Page,
  label: string,
  scope?: string,
): Promise<CapturedArtifact> {
  const selector = scope ?? "html";
  const html = await page.locator(selector).innerHTML();
  return {
    type: "dom_snapshot",
    label,
    timestamp: new Date(),
    data: html,
  };
}

export class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, CapturedArtifact[]>();

  async save(runId: string, artifact: CapturedArtifact): Promise<string> {
    const existing = this.artifacts.get(runId) ?? [];
    existing.push(artifact);
    this.artifacts.set(runId, existing);
    const key = `${runId}/${artifact.type}/${artifact.label}`;
    return key;
  }

  getArtifacts(runId: string): CapturedArtifact[] {
    return this.artifacts.get(runId) ?? [];
  }
}
