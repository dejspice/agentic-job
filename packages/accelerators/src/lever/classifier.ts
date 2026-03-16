import type { PageClassifier } from "@dejsol/core";

/**
 * Lever application pages follow consistent URL patterns and use stable
 * data-qa attributes that make deterministic classification reliable.
 *
 * Key structural differences from Greenhouse:
 * - Job listing lives at jobs.lever.co/{company}/{uuid}
 * - The apply form is a separate page at jobs.lever.co/{company}/{uuid}/apply
 * - data-qa="…" attributes are the most reliable selectors across tenants
 * - The form is a single scrollable page (not multi-step) in most cases
 */

export const leverClassifiers: PageClassifier[] = [
  {
    name: "lever_job_listing",
    selectors: [
      ".posting-headline",
      ".posting-header",
      "[data-qa='posting-title']",
      ".job-title",
    ],
    urlPatterns: [
      "jobs\\.lever\\.co/[^/]+/[0-9a-f\\-]{36}$",
      "hire\\.lever\\.co/[^/]+/postings/[0-9a-f\\-]{36}$",
    ],
    textPatterns: ["Apply for this job", "Apply now", "Job Description"],
    confidence: 0.95,
  },
  {
    name: "lever_application_form",
    selectors: [
      "#application-form",
      ".application-form",
      "[data-qa='application-form']",
      "form.page-centered-content",
    ],
    urlPatterns: [
      "jobs\\.lever\\.co/[^/]+/[0-9a-f\\-]{36}/apply",
      "hire\\.lever\\.co/[^/]+/postings/[0-9a-f\\-]{36}/apply",
    ],
    textPatterns: ["Submit application", "Submit your application"],
    confidence: 0.95,
  },
  {
    name: "lever_personal_info",
    selectors: [
      "[data-qa='name-input']",
      "[data-qa='email-input']",
      "input[name='name']",
      "input[name='email']",
      "#name",
      "#email",
    ],
    confidence: 0.9,
  },
  {
    name: "lever_resume_upload",
    selectors: [
      ".resume-upload",
      "[data-qa='resume-upload']",
      "input.resume-file-input",
      "input[type='file'][name='resume']",
      "[data-qa='resume-file-upload']",
      ".resume-input",
    ],
    textPatterns: ["Attach a resume file", "Upload Resume", "Drop your resume"],
    confidence: 0.9,
  },
  {
    name: "lever_application_questions",
    selectors: [
      ".application-additional-cards",
      "[data-qa='additional-cards']",
      ".custom-question",
      "[data-qa='custom-question']",
      ".eeo-question",
    ],
    textPatterns: ["Additional information", "Application questions"],
    confidence: 0.85,
  },
  {
    name: "lever_eeo_disclosures",
    selectors: [
      ".eeo-section",
      "[data-qa='eeo-section']",
      ".demographic-question",
      "[data-qa='demographic-section']",
    ],
    textPatterns: [
      "Voluntary Self-Identification",
      "Equal Employment Opportunity",
      "Gender",
      "Race / Ethnicity",
      "Veteran Status",
    ],
    confidence: 0.9,
  },
  {
    name: "lever_confirmation",
    selectors: [
      ".confirmation",
      "[data-qa='confirmation']",
      ".application-confirmation",
      ".success-message",
    ],
    urlPatterns: [
      "jobs\\.lever\\.co/[^/]+/[0-9a-f\\-]{36}/apply/confirmation",
      "jobs\\.lever\\.co/[^/]+/[0-9a-f\\-]{36}/apply\\?confirmation",
    ],
    textPatterns: [
      "Application submitted",
      "Thank you for applying",
      "Your application has been received",
      "We'll be in touch",
    ],
    confidence: 0.95,
  },
];

/**
 * Match a page against Lever classifiers using URL and title.
 * Returns all matching classifiers sorted by confidence descending.
 */
export function classifyLeverPage(
  url: string,
  title?: string,
): PageClassifier[] {
  const matches: PageClassifier[] = [];

  for (const classifier of leverClassifiers) {
    if (classifier.urlPatterns) {
      for (const pattern of classifier.urlPatterns) {
        if (new RegExp(pattern, "i").test(url)) {
          matches.push(classifier);
          break;
        }
      }
    }

    if (classifier.textPatterns && title) {
      for (const pattern of classifier.textPatterns) {
        if (title.includes(pattern)) {
          if (!matches.includes(classifier)) {
            matches.push(classifier);
          }
          break;
        }
      }
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Returns true when a URL likely belongs to a Lever-hosted job posting.
 */
export function isLeverUrl(url: string): boolean {
  return /jobs\.lever\.co|hire\.lever\.co/i.test(url);
}
