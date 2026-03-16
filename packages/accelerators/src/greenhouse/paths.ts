import type { PathTemplate } from "@dejsol/core";

/**
 * Standard single-page Greenhouse application flow.
 * Most Greenhouse boards present the entire application on one page
 * with sections stacked vertically (personal info → resume → questions → submit).
 */
export const singlePageFlow: PathTemplate = {
  name: "greenhouse_single_page",
  steps: [
    {
      state: "OPEN_JOB_PAGE",
      expectedUrl: "boards.greenhouse.io/.+/jobs/\\d+",
      expectedClassifier: "job_listing",
      actions: [
        { type: "NAVIGATE", target: "jobUrl" },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "DETECT_APPLY_ENTRY",
      expectedClassifier: "job_listing",
      actions: [
        { type: "CLICK", target: "#app_submit, a[href*='#app'], .btn-apply" },
      ],
    },
    {
      state: "UPLOAD_RESUME",
      expectedClassifier: "resume_upload",
      actions: [
        { type: "UPLOAD", target: 'input[type="file"][id*="resume"]', value: "resumeFile" },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "WAIT_FOR_PARSE",
      expectedClassifier: "personal_info",
      actions: [
        { type: "WAIT_FOR", target: "#first_name" },
      ],
    },
    {
      state: "VALIDATE_PARSED_PROFILE",
      expectedClassifier: "personal_info",
      actions: [
        { type: "READ_TEXT", target: "#first_name" },
        { type: "READ_TEXT", target: "#last_name" },
        { type: "READ_TEXT", target: "#email" },
      ],
    },
    {
      state: "FILL_REQUIRED_FIELDS",
      expectedClassifier: "personal_info",
      actions: [
        { type: "TYPE", target: "#first_name", value: "candidate.firstName" },
        { type: "TYPE", target: "#last_name", value: "candidate.lastName" },
        { type: "TYPE", target: "#email", value: "candidate.email" },
        { type: "TYPE", target: "#phone", value: "candidate.phone" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "ANSWER_SCREENING_QUESTIONS",
      expectedClassifier: "screening_questions",
      actions: [
        { type: "EXTRACT_FIELDS" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "REVIEW_DISCLOSURES",
      expectedClassifier: "eeoc_disclosures",
      actions: [
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "PRE_SUBMIT_CHECK",
      expectedClassifier: "application_form",
      actions: [
        { type: "SCREENSHOT" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "SUBMIT",
      expectedClassifier: "application_form",
      actions: [
        { type: "CLICK", target: '#submit_app, input[type="submit"], button[type="submit"]' },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "CAPTURE_CONFIRMATION",
      expectedClassifier: "confirmation",
      actions: [
        { type: "SCREENSHOT" },
        { type: "READ_TEXT", target: ".application-confirmation, #application_confirmation" },
      ],
    },
  ],
};

/**
 * Multi-step Greenhouse flow used by some enterprise configurations.
 * The application is split across multiple pages with a progress indicator.
 */
export const multiStepFlow: PathTemplate = {
  name: "greenhouse_multi_step",
  steps: [
    {
      state: "OPEN_JOB_PAGE",
      expectedUrl: "boards.greenhouse.io/.+/jobs/\\d+",
      expectedClassifier: "job_listing",
      actions: [
        { type: "NAVIGATE", target: "jobUrl" },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "DETECT_APPLY_ENTRY",
      expectedClassifier: "job_listing",
      actions: [
        { type: "CLICK", target: "#app_submit, a[href*='#app'], .btn-apply" },
      ],
    },
    {
      state: "UPLOAD_RESUME",
      expectedClassifier: "resume_upload",
      actions: [
        { type: "UPLOAD", target: 'input[type="file"][id*="resume"]', value: "resumeFile" },
        { type: "CLICK", target: ".btn-next, button:has-text('Next')" },
      ],
    },
    {
      state: "FILL_REQUIRED_FIELDS",
      expectedClassifier: "personal_info",
      actions: [
        { type: "TYPE", target: "#first_name", value: "candidate.firstName" },
        { type: "TYPE", target: "#last_name", value: "candidate.lastName" },
        { type: "TYPE", target: "#email", value: "candidate.email" },
        { type: "CLICK", target: ".btn-next, button:has-text('Next')" },
      ],
    },
    {
      state: "ANSWER_SCREENING_QUESTIONS",
      expectedClassifier: "screening_questions",
      actions: [
        { type: "EXTRACT_FIELDS" },
        { type: "CLICK", target: ".btn-next, button:has-text('Next')" },
      ],
    },
    {
      state: "REVIEW_DISCLOSURES",
      expectedClassifier: "eeoc_disclosures",
      actions: [
        { type: "SCREENSHOT" },
        { type: "CLICK", target: ".btn-next, button:has-text('Next')" },
      ],
    },
    {
      state: "PRE_SUBMIT_CHECK",
      actions: [
        { type: "SCREENSHOT" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "SUBMIT",
      actions: [
        { type: "CLICK", target: '#submit_app, input[type="submit"], button[type="submit"]' },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "CAPTURE_CONFIRMATION",
      expectedClassifier: "confirmation",
      actions: [
        { type: "SCREENSHOT" },
      ],
    },
  ],
};

export const greenhousePathTemplates: PathTemplate[] = [
  singlePageFlow,
  multiStepFlow,
];
