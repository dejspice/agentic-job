import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

/**
 * CSS selectors for Greenhouse "Apply" entry points, in priority order.
 *
 * Covers the canonical Greenhouse single-page board, data-attribute embed
 * patterns, alternate class names, href-based anchors, class-contains
 * patterns, and submit-input variants seen on live boards.
 *
 * All selectors are deterministic CSS — no Playwright-specific extensions.
 * Evaluated as a single combined selector by the WAIT_FOR command so the
 * first visible element matching any of them causes the wait to succeed.
 */
const GREENHOUSE_APPLY_SELECTORS: readonly string[] = [
  // Canonical Greenhouse ID
  "#app_submit",
  // Greenhouse data-attribute embed pattern
  '[data-provides="job-application-form"]',
  '[data-job-apply="true"]',
  // Canonical and common class names
  ".btn-apply",
  ".apply-button",
  ".apply-now",
  ".job-apply-btn",
  // href-based in-page anchor links
  "a[href*='#app']",
  'a[href*="#application"]',
  'a[href*="/apply"]',
  // Class-contains (catches apply-cta, apply-link, applyBtn, etc.)
  'button[class*="apply"]',
  'a[class*="apply"]',
  // Input-submit variant
  'input[type="submit"][value*="Apply"]',
];

export const detectApplyEntryState: StateHandler = {
  name: StateName.DETECT_APPLY_ENTRY,

  entryCriteria:
    "Job page is loaded and confirmed. The page DOM or accessibility tree is available for inspection.",

  successCriteria:
    "An 'Apply' button or equivalent entry point has been identified and its selector is stored in context data.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    const combined = GREENHOUSE_APPLY_SELECTORS.join(", ");

    const waitResult = await context.execute({
      type: "WAIT_FOR",
      target: combined,
      timeoutMs: 5000,
    });

    if (!waitResult.success) {
      if (context.captureArtifact) {
        const ref = await context.captureArtifact("screenshot", "detect-apply-entry-not-found");
        context.data.artifacts = context.data.artifacts ?? [];
        (context.data.artifacts as unknown[]).push(ref);
      }
      return { outcome: "failure", error: "Apply entry point not found" };
    }

    const clickResult = await context.execute({
      type: "CLICK",
      target: { kind: "css", value: combined },
    });

    if (!clickResult.success) {
      if (context.captureArtifact) {
        const ref = await context.captureArtifact("screenshot", "detect-apply-entry-click-failed");
        context.data.artifacts = context.data.artifacts ?? [];
        (context.data.artifacts as unknown[]).push(ref);
      }
      return {
        outcome: "failure",
        error: clickResult.error ?? "Failed to click apply entry",
      };
    }

    context.data.applyEntryClicked = true;
    return { outcome: "success" };
  },
};
