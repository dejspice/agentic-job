import type { PageClassifier } from "@dejsol/core";

/**
 * Greenhouse application pages follow predictable URL and DOM patterns.
 * These classifiers match deterministically without LLM calls.
 */

export const greenhouseClassifiers: PageClassifier[] = [
  {
    name: "job_listing",
    selectors: [".opening", "#header .company-name", ".job-post"],
    urlPatterns: [
      "boards\\.greenhouse\\.io/.+/jobs/\\d+",
      "job-boards\\.greenhouse\\.io/.+/jobs/\\d+",
    ],
    textPatterns: ["Apply for this job", "Department", "Location"],
    confidence: 0.95,
  },
  {
    name: "application_form",
    selectors: [
      "#application",
      "#application_form",
      "form#application_form",
    ],
    urlPatterns: [
      "boards\\.greenhouse\\.io/.+/jobs/\\d+#app",
      "boards\\.greenhouse\\.io/.+/jobs/\\d+\\?.*#application",
    ],
    textPatterns: ["Submit Application", "Apply for this Job"],
    confidence: 0.95,
  },
  {
    name: "personal_info",
    selectors: [
      "#first_name",
      "#last_name",
      "#email",
      'input[name="job_application[first_name]"]',
    ],
    confidence: 0.9,
  },
  {
    name: "resume_upload",
    selectors: [
      'input[type="file"][id*="resume"]',
      "#resume_text",
      'label[for*="resume"]',
      ".attach-or-paste",
    ],
    textPatterns: ["Resume/CV", "Attach", "Paste"],
    confidence: 0.9,
  },
  {
    name: "cover_letter",
    selectors: [
      'input[type="file"][id*="cover_letter"]',
      "#cover_letter_text",
      'label[for*="cover_letter"]',
    ],
    textPatterns: ["Cover Letter"],
    confidence: 0.85,
  },
  {
    name: "screening_questions",
    selectors: [
      "#custom_fields",
      ".field[id*='job_application_answers']",
      'select[id*="job_application_answers"]',
      'textarea[id*="job_application_answers"]',
    ],
    confidence: 0.85,
  },
  {
    name: "eeoc_disclosures",
    selectors: [
      "#demographic_questions",
      "#eeoc_fields",
      'select[id*="demographic"]',
    ],
    textPatterns: [
      "Voluntary Self-Identification",
      "Equal Employment Opportunity",
      "Gender",
      "Race",
      "Veteran Status",
    ],
    confidence: 0.9,
  },
  {
    name: "embedded_form",
    selectors: [
      'iframe[src*="boards.greenhouse.io"]',
      'iframe[src*="grnh.se"]',
    ],
    confidence: 0.9,
  },
  {
    name: "verification_challenge",
    selectors: [
      'input[name="security_code"]',
      '#security_code',
      'input[maxlength="1"]',
      '.security-code',
    ],
    textPatterns: [
      "verification code was sent",
      "Security code",
      "confirm you're a human",
      "enter the 8-character code",
    ],
    confidence: 0.95,
  },
  {
    name: "confirmation",
    selectors: [
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
    ],
    textPatterns: [
      "Application submitted",
      "Thank you for applying",
      "Your application has been submitted",
      "Thank you for your application",
      "Your application has been received",
      "We have received your application",
      "Application complete",
      "Successfully submitted",
    ],
    confidence: 0.95,
  },
];

/**
 * Match a page against Greenhouse classifiers using URL and title.
 * Returns all classifiers that match, sorted by confidence descending.
 */
export function classifyGreenhousePage(
  url: string,
  title?: string,
): PageClassifier[] {
  const matches: PageClassifier[] = [];

  for (const classifier of greenhouseClassifiers) {
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
 * Returns true when a URL likely belongs to a Greenhouse-hosted board.
 */
export function isGreenhouseUrl(url: string): boolean {
  return /boards\.greenhouse\.io|job-boards\.greenhouse\.io/i.test(url);
}
