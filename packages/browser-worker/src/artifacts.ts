/**
 * Artifact capture pipeline for the browser-worker.
 *
 * Layered design
 * ──────────────
 *  1. CapturedArtifact   — raw in-memory capture (Buffer | string + metadata)
 *  2. ArtifactStore      — storage abstraction; save() persists the raw capture
 *                          and returns a typed ArtifactReference
 *  3. Capture helpers    — low-level (screenshot, dom_snapshot) and
 *                          high-level (capture-and-store in one call) functions
 *  4. Store adapters     — InMemoryArtifactStore (test / dev)
 *                          LocalFileArtifactStore (local debugging)
 *                          Future: S3ArtifactStore, GCSArtifactStore
 */

import type { Page } from "playwright";
import type { ArtifactKind, ArtifactReference } from "@dejsol/core";

// ---------------------------------------------------------------------------
// Raw capture
// ---------------------------------------------------------------------------

/**
 * In-flight artifact — holds the raw binary or text data alongside capture
 * metadata, before it has been persisted to a storage backend.
 */
export interface CapturedArtifact {
  kind: ArtifactKind;
  /** Human-readable label (e.g. state name or descriptive tag). */
  label: string;
  capturedAt: Date;
  /** Raw payload — Buffer for binary (screenshots, traces) or string for text. */
  data: Buffer | string;
  sizeBytes?: number;
  mimeType?: string;
}

// ---------------------------------------------------------------------------
// Storage abstraction
// ---------------------------------------------------------------------------

/**
 * Artifact storage backend.
 *
 * Implementations must be async — cloud backends involve I/O.
 * save() receives the raw CapturedArtifact and must return a fully resolved
 * ArtifactReference whose url is durable from the caller's perspective.
 *
 * context.state should be the StateName under which this capture occurred,
 * forwarded into the ArtifactReference for downstream grouping.
 */
export interface ArtifactStore {
  save(
    runId: string,
    artifact: CapturedArtifact,
    context?: { state?: string },
  ): Promise<ArtifactReference>;
}

// ---------------------------------------------------------------------------
// Low-level capture helpers
// ---------------------------------------------------------------------------

/**
 * Capture a viewport / full-page PNG screenshot.
 * Returns a CapturedArtifact — call ArtifactStore.save() to persist it.
 */
export async function captureScreenshot(
  page: Page,
  label: string,
  fullPage = false,
): Promise<CapturedArtifact> {
  const buffer = await page.screenshot({ fullPage, type: "png" });
  return {
    kind: "screenshot",
    label,
    capturedAt: new Date(),
    data: buffer,
    sizeBytes: buffer.length,
    mimeType: "image/png",
  };
}

/**
 * Capture the serialised inner HTML of a page element (default: <html>).
 * Returns a CapturedArtifact — call ArtifactStore.save() to persist it.
 */
export async function captureDomSnapshot(
  page: Page,
  label: string,
  scope?: string,
): Promise<CapturedArtifact> {
  const selector = scope ?? "html";
  const html = await page.locator(selector).innerHTML();
  const sizeBytes = Buffer.byteLength(html, "utf-8");
  return {
    kind: "dom_snapshot",
    label,
    capturedAt: new Date(),
    data: html,
    sizeBytes,
    mimeType: "text/html",
  };
}

// ---------------------------------------------------------------------------
// High-level capture-and-store helpers
// ---------------------------------------------------------------------------

/**
 * Capture a screenshot and immediately persist it via the provided store.
 *
 * Returns a typed ArtifactReference for direct inclusion in activity results.
 * Use this at state transition boundaries where a screenshot is required per policy.
 */
export async function captureAndStoreScreenshot(
  page: Page,
  store: ArtifactStore,
  runId: string,
  label: string,
  options?: {
    fullPage?: boolean;
    /** StateName at capture time — forwarded into the ArtifactReference. */
    state?: string;
  },
): Promise<ArtifactReference> {
  const artifact = await captureScreenshot(page, label, options?.fullPage);
  return store.save(runId, artifact, { state: options?.state });
}

/**
 * Capture a DOM snapshot and immediately persist it via the provided store.
 *
 * Returns a typed ArtifactReference for direct inclusion in activity results.
 * Use this at form-fill boundaries where a DOM snapshot is required per policy.
 */
export async function captureAndStoreDomSnapshot(
  page: Page,
  store: ArtifactStore,
  runId: string,
  label: string,
  options?: {
    /** CSS selector scope (defaults to 'html'). */
    scope?: string;
    /** StateName at capture time — forwarded into the ArtifactReference. */
    state?: string;
  },
): Promise<ArtifactReference> {
  const artifact = await captureDomSnapshot(page, label, options?.scope);
  return store.save(runId, artifact, { state: options?.state });
}

// ---------------------------------------------------------------------------
// Store adapters
// ---------------------------------------------------------------------------

/**
 * In-memory artifact store.
 *
 * Intended for unit tests and local dev runs where no persistent storage is
 * needed.  All data is discarded when the process exits.
 *
 * getRefs() and getData() are test/inspection helpers not part of the
 * ArtifactStore interface.
 */
export class InMemoryArtifactStore implements ArtifactStore {
  private readonly _refs = new Map<string, ArtifactReference[]>();
  private readonly _data = new Map<string, Buffer | string>();

  async save(
    runId: string,
    artifact: CapturedArtifact,
    context?: { state?: string },
  ): Promise<ArtifactReference> {
    const key = `${runId}/${artifact.kind}/${artifact.label}`;
    this._data.set(key, artifact.data);

    const ref: ArtifactReference = {
      kind: artifact.kind,
      label: artifact.label,
      url: key,
      capturedAt: artifact.capturedAt.toISOString(),
      ...(context?.state !== undefined ? { state: context.state } : {}),
      ...(artifact.sizeBytes !== undefined ? { sizeBytes: artifact.sizeBytes } : {}),
      ...(artifact.mimeType  !== undefined ? { mimeType: artifact.mimeType }  : {}),
    };

    const existing = this._refs.get(runId) ?? [];
    existing.push(ref);
    this._refs.set(runId, existing);
    return ref;
  }

  /** Return all ArtifactReferences accumulated for a run. */
  getRefs(runId: string): ArtifactReference[] {
    return this._refs.get(runId) ?? [];
  }

  /** Return the raw data stored under a key (url from the reference). */
  getData(key: string): Buffer | string | undefined {
    return this._data.get(key);
  }
}

/**
 * Local-file artifact store.
 *
 * Writes artifacts to a directory tree under baseDir:
 *   <baseDir>/<runId>/<kind>/<label>.<ext>
 *
 * Intended for local development and integration testing where inspecting
 * captured files on disk is useful.
 */
export class LocalFileArtifactStore implements ArtifactStore {
  constructor(private readonly baseDir: string) {}

  async save(
    runId: string,
    artifact: CapturedArtifact,
    context?: { state?: string },
  ): Promise<ArtifactReference> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const dir = join(this.baseDir, runId, artifact.kind);
    await mkdir(dir, { recursive: true });

    const ext =
      artifact.mimeType === "image/png" ? ".png"
      : artifact.mimeType === "text/html" ? ".html"
      : ".bin";
    const safeName = artifact.label.replace(/[^a-zA-Z0-9\-_]/g, "_");
    const filePath = join(dir, `${safeName}${ext}`);

    if (Buffer.isBuffer(artifact.data)) {
      await writeFile(filePath, artifact.data);
    } else {
      await writeFile(filePath, artifact.data, "utf-8");
    }

    const ref: ArtifactReference = {
      kind: artifact.kind,
      label: artifact.label,
      url: filePath,
      capturedAt: artifact.capturedAt.toISOString(),
      ...(context?.state !== undefined ? { state: context.state } : {}),
      ...(artifact.sizeBytes !== undefined ? { sizeBytes: artifact.sizeBytes } : {}),
      ...(artifact.mimeType  !== undefined ? { mimeType: artifact.mimeType }  : {}),
    };
    return ref;
  }
}
