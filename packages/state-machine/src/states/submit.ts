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

/**
 * Selectors that indicate a verification-code challenge was presented.
 * Greenhouse sends an 8-character or 6-digit code to the applicant's email
 * when it detects potential bot behavior.  The form IS submitted — the
 * candidate just needs to enter the code to finalize.
 */
const VERIFICATION_CHALLENGE_SELECTORS = [
  'input[name="security_code"]',
  'input[placeholder*="code"]',
  'input[aria-label*="code"]',
  ".security-code",
  "#security_code",
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
      // Check for verification-code challenge.  When Greenhouse suspects
      // automation it sends a code to the applicant's email rather than
      // immediately showing a confirmation page.  The application IS
      // submitted — it is simply gated behind the code entry.
      // We return success with verificationRequired=true so the harness
      // can log this as VERIFICATION_REQUIRED rather than a hard failure.
      const verificationCheck = await context.execute({
        type: "WAIT_FOR",
        target: VERIFICATION_CHALLENGE_SELECTORS,
        timeoutMs: 3000,
      });

      if (verificationCheck.success) {
        context.data.submitted = true;
        context.data.verificationRequired = true;
        return {
          outcome: "success",
          data: { verificationRequired: true },
        };
      }

      return {
        outcome: "failure",
        error: "Confirmation page did not appear after submit",
      };
    }

    context.data.submitted = true;
    return { outcome: "success" };
  },
};
