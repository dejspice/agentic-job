import { AtsType } from "./enums/ats-type.js";

/**
 * URL-pattern → ATS detection.
 * Patterns aligned with dejsol-capture/ats-detect.js for consistency.
 */
const ATS_URL_PATTERNS: ReadonlyArray<{ pattern: RegExp; ats: AtsType }> = [
  { pattern: /greenhouse\.io/i, ats: AtsType.GREENHOUSE },
  { pattern: /jobs\.lever\.co|lever\.co/i, ats: AtsType.LEVER },
  { pattern: /myworkday(jobs)?\.com|workday\.com/i, ats: AtsType.WORKDAY },
  { pattern: /icims\.com/i, ats: AtsType.ICIMS },
  { pattern: /ashbyhq\.com/i, ats: AtsType.ASHBY },
  { pattern: /smartrecruiters\.com/i, ats: AtsType.SMARTRECRUITERS },
  { pattern: /taleo\.net/i, ats: AtsType.TALEO },
  { pattern: /successfactors\.com/i, ats: AtsType.SAP },
];

/**
 * Detect the ATS platform from a job URL.
 * Returns `AtsType.CUSTOM` when no known pattern matches.
 */
export function detectATS(url: string): AtsType {
  for (const { pattern, ats } of ATS_URL_PATTERNS) {
    if (pattern.test(url)) return ats;
  }
  return AtsType.CUSTOM;
}

/**
 * Whether the application pipeline currently supports this ATS.
 * Greenhouse is live; Lever is next (target: April 16).
 */
export function isSupported(ats: AtsType): boolean {
  return ats === AtsType.GREENHOUSE;
}
