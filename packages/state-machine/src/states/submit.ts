import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

const GREENHOUSE_SUBMIT_SELECTORS =
  '#submit_app, input[type="submit"], button[type="submit"]';

/**
 * Confirmation selectors for post-submit page detection.
 *
 * Expanded beyond the canonical Greenhouse classes to cover boards that use
 * alternate confirmation element names or flash notice patterns.
 */
const CONFIRMATION_WAIT_SELECTORS = [
  ".application-confirmation",
  "#application_confirmation",
  ".flash-success",
  ".confirmation-message",
  ".success-message",
  ".submitted-message",
  ".application-success",
  '[data-application-complete="true"]',
  ".flash.notice",
  ".notice.success",
].join(", ");

export const submitState: StateHandler = {
  name: StateName.SUBMIT,

  entryCriteria:
    "Pre-submit check passed. Screenshot captured. If review mode, human approval has been received.",

  successCriteria:
    "The submit button has been clicked and the page has transitioned to a confirmation or thank-you page. Screenshot captured post-submit.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("screenshot", "pre-submit");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    const clickResult = await context.execute({
      type: "CLICK",
      target: { kind: "css", value: GREENHOUSE_SUBMIT_SELECTORS },
    });

    if (!clickResult.success) {
      return { outcome: "failure", error: clickResult.error ?? "Submit click failed" };
    }

    const waitResult = await context.execute({
      type: "WAIT_FOR",
      target: CONFIRMATION_WAIT_SELECTORS,
      timeoutMs: 10000,
    });

    // Always capture post-submit screenshot regardless of confirmation outcome —
    // it is the permanent audit record that the submit button was activated.
    if (context.captureArtifact) {
      const ref = await context.captureArtifact("screenshot", "post-submit");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    if (!waitResult.success) {
      return {
        outcome: "failure",
        error: "Confirmation page did not appear after submit",
      };
    }

    context.data.submitted = true;
    return { outcome: "success" };
  },
};
