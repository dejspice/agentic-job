/**
 * ATS Router — deterministic ATS detection from job URLs.
 *
 * Inspects the URL hostname/path to identify which Applicant Tracking System
 * a job posting belongs to. Used by the batch runner to route applications
 * to the correct accelerator.
 */

import { AtsType } from "./enums/ats-type.js";

interface AtsPattern {
  ats: AtsType;
  test: (url: URL) => boolean;
}

const PATTERNS: readonly AtsPattern[] = [
  {
    ats: AtsType.GREENHOUSE,
    test: (u) =>
      u.hostname === "boards.greenhouse.io" ||
      u.hostname.endsWith(".greenhouse.io") ||
      u.pathname.includes("/greenhouse/") ||
      u.hostname === "app.greenhouse.io",
  },
  {
    ats: AtsType.LEVER,
    test: (u) =>
      u.hostname === "jobs.lever.co" ||
      u.hostname.endsWith(".lever.co"),
  },
  {
    ats: AtsType.ASHBY,
    test: (u) =>
      u.hostname === "jobs.ashbyhq.com" ||
      u.hostname.endsWith(".ashbyhq.com"),
  },
  {
    ats: AtsType.ICIMS,
    test: (u) =>
      u.hostname.endsWith(".icims.com") ||
      u.pathname.includes("/icims2/"),
  },
  {
    ats: AtsType.SMARTRECRUITERS,
    test: (u) =>
      u.hostname === "jobs.smartrecruiters.com" ||
      u.hostname.endsWith(".smartrecruiters.com"),
  },
  {
    ats: AtsType.WORKDAY,
    test: (u) =>
      u.hostname.endsWith(".myworkdayjobs.com") ||
      u.hostname.endsWith(".wd1.myworkdaysite.com") ||
      u.hostname.endsWith(".wd5.myworkdaysite.com") ||
      u.hostname.includes("workday"),
  },
  {
    ats: AtsType.TALEO,
    test: (u) =>
      u.hostname.includes("taleo") ||
      u.pathname.includes("/taleo/"),
  },
  {
    ats: AtsType.SAP,
    test: (u) =>
      u.hostname.includes("successfactors") ||
      u.hostname.endsWith(".sap.com"),
  },
];

/**
 * Detect the ATS type from a job URL.
 * Returns AtsType.CUSTOM if no known pattern matches.
 */
export function detectATS(url: string): AtsType {
  try {
    const parsed = new URL(url);
    for (const pattern of PATTERNS) {
      if (pattern.test(parsed)) return pattern.ats;
    }
  } catch {
    // Malformed URL — fall through to CUSTOM
  }
  return AtsType.CUSTOM;
}

/** Currently supported ATS types for automated apply. */
const SUPPORTED_ATS: ReadonlySet<AtsType> = new Set([
  AtsType.GREENHOUSE,
]);

/**
 * Check whether the given ATS type is currently supported for automated apply.
 */
export function isSupported(ats: AtsType): boolean {
  return SUPPORTED_ATS.has(ats);
}
