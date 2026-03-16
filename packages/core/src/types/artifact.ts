/**
 * Typed artifact shapes shared across the browser-worker capture pipeline
 * and the workflow accumulation layer.
 *
 * ArtifactKind is a string-union (not an enum) so new kinds can be added
 * without a breaking change to existing switch/pattern consumers.
 */

/**
 * The category of a captured artifact.
 *
 * screenshot             — full-page or viewport PNG from a state transition
 * dom_snapshot           — serialised inner HTML at a key interaction point
 * confirmation_screenshot — post-submit screenshot capturing the confirmation page
 * trace                  — Playwright/CDP trace archive (.zip)
 * har                    — HTTP archive (.har) for network replay / debugging
 * accessibility_tree     — serialised a11y tree snapshot (JSON)
 */
export type ArtifactKind =
  | "screenshot"
  | "dom_snapshot"
  | "confirmation_screenshot"
  | "trace"
  | "har"
  | "accessibility_tree";

/**
 * A resolved artifact reference — the durable pointer returned after the
 * raw binary/text data has been persisted to an ArtifactStore.
 *
 * The url field is the canonical address used by downstream consumers
 * (console, API, DB).  For in-memory / local-file stores it is a
 * storage key or absolute path; for cloud stores it will be a
 * pre-signed or public URL.
 */
export interface ArtifactReference {
  kind: ArtifactKind;
  /** Human-readable label, typically <StateName>/<sub-context>. */
  label: string;
  /** Storage address returned by ArtifactStore.save(). */
  url: string;
  /** ISO-8601 timestamp of when the capture was taken. */
  capturedAt: string;
  /** StateName during which this artifact was captured. */
  state?: string;
  sizeBytes?: number;
  mimeType?: string;
}
