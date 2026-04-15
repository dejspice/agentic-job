import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

/**
 * Text patterns that indicate a job posting is no longer actionable.
 * Matched case-insensitively against the page title and visible body text.
 */
const EXPIRED_PAGE_PATTERNS: readonly RegExp[] = [
  /no longer accepting applications/i,
  /this job is no longer available/i,
  /this position has been filled/i,
  /this job has been closed/i,
  /job not found/i,
  /page not found/i,
  /404\s*[-–—]\s*not found/i,
  /posting has expired/i,
  /no longer listed/i,
  /this listing is closed/i,
  /role has been filled/i,
];

/**
 * URL patterns that indicate the browser was redirected away from the
 * specific job posting to a generic listing page.
 */
const REDIRECT_URL_PATTERNS: readonly RegExp[] = [
  /greenhouse\.io\/[^/]+\/jobs\/?$/i,
  /greenhouse\.io\/[^/]+\/?$/i,
  /\/careers\/?$/i,
  /\/jobs\/?$/i,
];

export const openJobPageState: StateHandler = {
  name: StateName.OPEN_JOB_PAGE,

  entryCriteria:
    "INIT completed successfully. Browser session is allocated and ready. Job URL is available in context.",

  successCriteria:
    "The job listing page has loaded, the page title or key content confirms it matches the expected posting, and no access-denied or CAPTCHA block is present.",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    const navResult = await context.execute({
      type: "NAVIGATE",
      url: context.jobUrl,
    });
    if (!navResult.success) {
      return { outcome: "failure", error: navResult.error ?? "Navigation failed" };
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("screenshot", "open-job-page");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    const titleResult = await context.execute({ type: "CLASSIFY_PAGE" });
    let pageTitle = "";
    let pageUrl = "";
    if (titleResult.success && titleResult.data) {
      pageTitle = String((titleResult.data as Record<string, unknown>).title ?? "");
      pageUrl = String((titleResult.data as Record<string, unknown>).url ?? "");
      context.data.pageTitle = pageTitle;
      context.data.pageUrl = pageUrl;
    }

    // ── Expired / removed posting detection ──────────────────────────
    // Check title for expired patterns
    if (EXPIRED_PAGE_PATTERNS.some((p) => p.test(pageTitle))) {
      context.data.pageExpired = true;
      context.data.skipReason = `Page title indicates expired posting: "${pageTitle}"`;
      return { outcome: "success" };
    }

    // Check if redirected away from the specific job URL to a listing page
    if (pageUrl && context.jobUrl) {
      const originalPath = context.jobUrl.replace(/^https?:\/\/[^/]+/, "");
      const landedPath = pageUrl.replace(/^https?:\/\/[^/]+/, "");
      if (originalPath !== landedPath && REDIRECT_URL_PATTERNS.some((p) => p.test(pageUrl))) {
        context.data.pageExpired = true;
        context.data.skipReason = `Redirected from job page to listing: ${pageUrl}`;
        return { outcome: "success" };
      }
    }

    // Check body text for expired patterns (lightweight: read first 2000 chars of body)
    const bodyResult = await context.execute({ type: "READ_TEXT", selector: "body" });
    if (bodyResult.success && bodyResult.data) {
      const bodyText = String((bodyResult.data as Record<string, unknown>).text ?? "").substring(0, 2000);
      if (EXPIRED_PAGE_PATTERNS.some((p) => p.test(bodyText))) {
        context.data.pageExpired = true;
        context.data.skipReason = "Page body indicates expired/closed posting";
        return { outcome: "success" };
      }
    }

    return { outcome: "success" };
  },
};
