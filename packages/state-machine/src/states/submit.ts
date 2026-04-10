import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

const GREENHOUSE_SUBMIT_SELECTORS =
  '#submit_app, input[type="submit"], button[type="submit"]';

/**
 * Confirmation selectors for post-submit page detection.
 *
 * Covers legacy Greenhouse classes and new Remix-based board patterns.
 */
const CONFIRMATION_CSS_SELECTORS = [
  ".confirmation",
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

const CONFIRMATION_TEXT_SELECTORS = [
  "text=Thank you for applying",
  "text=Thank you for your interest",
  "text=Thank you for considering",
  "text=Your application has been received",
  "text=application has been submitted",
  "text=We have received your application",
  "text=View more jobs at",
  "text=Application submitted",
];

/**
 * Verification/email challenge selectors — both code-entry and email-link
 * variants.
 *
 * Greenhouse Remix boards show two patterns after submit:
 *   1. Code entry: "Check your email" + "We sent a verification code" +
 *      input field labeled "Verification code" + "Verify" button
 *   2. Email link: "Verify your email address" + "We've sent a
 *      verification email" — no input, user clicks link in their inbox
 *
 * Both indicate the application WAS submitted successfully.
 */
const VERIFICATION_CHALLENGE_SELECTORS = [
  'input[name="security_code"]',
  'input[placeholder*="code" i]',
  'input[aria-label*="code" i]',
  'input[aria-label*="Verification" i]',
  ".security-code",
  "#security_code",
].join(", ");

const VERIFICATION_CHALLENGE_TEXT_SELECTORS = [
  "text=verification code was sent",
  "text=We sent a verification code",
  "text=Verification code",
  "text=Verify your email",
  "text=Check your email",
  "text=confirm you're a human",
  "text=Security code",
  "text=enter the 8-character code",
  "text=enter the 6-digit code",
  "text=sent a verification email",
  "text=verification email to",
];

/**
 * Detect whether the submit button has disappeared from the page.
 * After Greenhouse Remix navigation, the form page is replaced entirely.
 */
async function submitButtonGone(
  execute: NonNullable<import("../types.js").StateContext["execute"]>,
): Promise<boolean> {
  const check = await execute({
    type: "WAIT_FOR",
    target: GREENHOUSE_SUBMIT_SELECTORS,
    timeoutMs: 500,
  });
  return !check.success;
}

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

    // force: true bypasses Playwright's actionability check — the EEOC
    // section's tall legal content can visually overlap the submit button
    // and Playwright refuses to click through it without force.
    const clickResult = await context.execute({
      type: "CLICK",
      target: { kind: "css", value: GREENHOUSE_SUBMIT_SELECTORS },
      force: true,
    });

    if (!clickResult.success) {
      return { outcome: "failure", error: clickResult.error ?? "Submit click failed" };
    }

    // After clicking submit, Greenhouse Remix boards navigate to a new URL.
    // Wait briefly for the navigation to settle before probing selectors.
    await context.execute({ type: "WAIT_FOR", target: "body", timeoutMs: 8000 });

    // ── Strategy 1: confirmation page (direct success) ────────────────
    let confirmed = await context.execute({
      type: "WAIT_FOR",
      target: CONFIRMATION_CSS_SELECTORS,
      timeoutMs: 3000,
    });
    if (!confirmed.success) {
      for (const textSel of CONFIRMATION_TEXT_SELECTORS) {
        const tw = await context.execute({
          type: "WAIT_FOR", target: textSel, timeoutMs: 2000,
        });
        if (tw.success) { confirmed = tw; break; }
      }
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("screenshot", "post-submit");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    if (confirmed.success) {
      context.data.submitted = true;
      return { outcome: "success" };
    }

    // ── Strategy 2: verification challenge (code or email-link) ───────
    let verificationFound = await context.execute({
      type: "WAIT_FOR",
      target: VERIFICATION_CHALLENGE_SELECTORS,
      timeoutMs: 3000,
    });

    if (!verificationFound.success) {
      for (const textSel of VERIFICATION_CHALLENGE_TEXT_SELECTORS) {
        const tw = await context.execute({
          type: "WAIT_FOR", target: textSel, timeoutMs: 1500,
        });
        if (tw.success) { verificationFound = tw; break; }
      }
    }

    if (verificationFound.success) {
      context.data.submitted = true;
      context.data.verificationRequired = true;
      return {
        outcome: "success",
        data: { verificationRequired: true },
      };
    }

    // ── Strategy 3: submit button gone (page navigated away from form) ─
    // If the submit button no longer exists the form was accepted and the
    // page navigated.  Treat as success — the confirmation might use a
    // non-standard element we don't recognize yet.
    const buttonGone = await submitButtonGone(context.execute);
    if (buttonGone) {
      context.data.submitted = true;
      context.data.confirmationDetection = "submit-button-gone";
      return { outcome: "success" };
    }

    return {
      outcome: "failure",
      error: "Confirmation page did not appear after submit",
    };
  },
};
