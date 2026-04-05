import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

/**
 * Selectors that indicate the Greenhouse application form is already
 * rendered inline on the page (no click needed). This is the most common
 * pattern on job-boards.greenhouse.io single-page boards.
 *
 * Sourced from the Greenhouse accelerator classifier (application_form
 * and personal_info page types).
 */
const GREENHOUSE_INLINE_FORM_SELECTORS: readonly string[] = [
  "#application_form",
  "#application",
  "form#application_form",
  "#first_name",
];

/**
 * CSS selectors for Greenhouse "Apply" entry points, in priority order.
 *
 * Used only when the form is NOT already inline. Covers the canonical
 * Greenhouse separate-page board, data-attribute embed patterns, alternate
 * class names, href-based anchors, class-contains patterns, and
 * submit-input variants seen on live boards.
 */
const GREENHOUSE_APPLY_SELECTORS: readonly string[] = [
  "#app_submit",
  '[data-provides="job-application-form"]',
  '[data-job-apply="true"]',
  'button[aria-label="Apply"]',
  'button[aria-label="Apply now"]',
  ".btn-apply",
  ".apply-button",
  ".apply-now",
  ".job-apply-btn",
  "a[href*='#app']",
  'a[href*="#application"]',
  'a[href*="/apply"]',
  'button[class*="apply"]',
  'a[class*="apply"]',
  'input[type="submit"][value*="Apply"]',
];

export const detectApplyEntryState: StateHandler = {
  name: StateName.DETECT_APPLY_ENTRY,

  entryCriteria:
    "Job page is loaded and confirmed. The page DOM or accessibility tree is available for inspection.",

  successCriteria:
    "An 'Apply' button or equivalent entry point has been identified and its selector is stored in context data, " +
    "OR the application form is already present inline on the page.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    // Deterministic check: is the application form already inline?
    const inlineSelector = GREENHOUSE_INLINE_FORM_SELECTORS.join(", ");
    const inlineResult = await context.execute({
      type: "WAIT_FOR",
      target: inlineSelector,
      timeoutMs: 3000,
    });

    if (inlineResult.success) {
      context.data.applyEntryClicked = false;
      context.data.formAlreadyInline = true;
      return { outcome: "success" };
    }

    // Fall back: look for a separate "Apply" button to click
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
