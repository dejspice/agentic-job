/**
 * Workflow-level artifact accumulation.
 *
 * The browser-worker's ArtifactStore handles raw capture and persistence.
 * This module handles the *aggregation* side: collecting ArtifactReferences
 * that flow out of activity results and building the per-run bundle that
 * the workflow carries and ultimately persists.
 *
 * RunArtifactBundle is the runtime shape.  bundleToArtifactUrls() converts
 * it to the legacy ArtifactUrls shape used by ApplyRun.artifactUrlsJson for
 * database persistence.
 */

import type { ArtifactReference, ArtifactUrls } from "@dejsol/core";

// ---------------------------------------------------------------------------
// Run-level bundle
// ---------------------------------------------------------------------------

/**
 * Accumulates all ArtifactReferences produced during a run.
 *
 * byState  — references indexed by StateName string; used by the run-detail
 *            view to show artifacts alongside each step in the timeline.
 * all      — flat ordered list for chronological audit and bulk operations.
 */
export interface RunArtifactBundle {
  byState: Record<string, ArtifactReference[]>;
  all: ArtifactReference[];
}

/** Return an initialised empty bundle to seed workflow-level artifact tracking. */
export function emptyBundle(): RunArtifactBundle {
  return { byState: {}, all: [] };
}

/**
 * Merge one or more ArtifactReferences into an existing bundle (in place).
 *
 * state — the StateName string under which the references are filed in
 *         byState.  If omitted the references are appended to all but not
 *         indexed under any state key.
 */
export function mergeArtifacts(
  bundle: RunArtifactBundle,
  refs: ArtifactReference[],
  state?: string,
): void {
  if (refs.length === 0) return;

  bundle.all.push(...refs);

  if (state !== undefined) {
    const existing = bundle.byState[state] ?? [];
    existing.push(...refs);
    bundle.byState[state] = existing;
  }
}

// ---------------------------------------------------------------------------
// Legacy shape adapter
// ---------------------------------------------------------------------------

/**
 * Convert a RunArtifactBundle to the ArtifactUrls shape stored in
 * ApplyRun.artifactUrlsJson.
 *
 * Mapping:
 *   screenshot              → screenshots Record<label, url>
 *   dom_snapshot            → domSnapshots Record<label, url>
 *   confirmation_screenshot → confirmationScreenshot (first occurrence)
 *   har                     → harFile (first occurrence)
 *   trace / accessibility_tree → not surfaced in the legacy shape
 */
export function bundleToArtifactUrls(bundle: RunArtifactBundle): ArtifactUrls {
  const screenshots: Record<string, string> = {};
  const domSnapshots: Record<string, string> = {};
  let harFile: string | undefined;
  let confirmationScreenshot: string | undefined;

  for (const ref of bundle.all) {
    switch (ref.kind) {
      case "screenshot":
        screenshots[ref.label] = ref.url;
        break;
      case "dom_snapshot":
        domSnapshots[ref.label] = ref.url;
        break;
      case "confirmation_screenshot":
        if (confirmationScreenshot === undefined) {
          confirmationScreenshot = ref.url;
        }
        break;
      case "har":
        if (harFile === undefined) {
          harFile = ref.url;
        }
        break;
      // trace and accessibility_tree are not surfaced in the legacy shape.
      default:
        break;
    }
  }

  return {
    ...(Object.keys(screenshots).length > 0  ? { screenshots }  : {}),
    ...(Object.keys(domSnapshots).length > 0 ? { domSnapshots } : {}),
    ...(harFile               !== undefined  ? { harFile }               : {}),
    ...(confirmationScreenshot !== undefined ? { confirmationScreenshot } : {}),
  };
}
