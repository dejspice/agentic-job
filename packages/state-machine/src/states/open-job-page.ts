import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

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
    if (titleResult.success && titleResult.data) {
      context.data.pageTitle = (titleResult.data as Record<string, unknown>).title;
      context.data.pageUrl = (titleResult.data as Record<string, unknown>).url;
    }

    return { outcome: "success" };
  },
};
