import type { PathTemplate } from "@dejsol/core";

/**
 * Lever application flow path templates.
 *
 * Lever presents its application as a single scrollable page in most
 * configurations.  The key structural difference from Greenhouse is that
 * the apply form lives at a SEPARATE URL (/apply suffix) rather than being
 * anchored on the job listing page.
 *
 * Two entry flows are captured:
 *   1. via_job_listing  — start at the job listing, click Apply
 *   2. direct_apply     — navigate directly to the /apply URL
 */

// ---------------------------------------------------------------------------
// Standard flow: job listing → click Apply → fill form → submit
// ---------------------------------------------------------------------------

export const viaJobListingFlow: PathTemplate = {
  name: "lever_via_job_listing",
  steps: [
    {
      state: "OPEN_JOB_PAGE",
      expectedUrl: "jobs\\.lever\\.co/[^/]+/[0-9a-f\\-]{36}$",
      expectedClassifier: "lever_job_listing",
      actions: [
        { type: "NAVIGATE", target: "jobUrl" },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "DETECT_APPLY_ENTRY",
      expectedClassifier: "lever_job_listing",
      actions: [
        {
          type: "CLICK",
          target:
            "[data-qa='btn-apply-bottom'], [data-qa='apply-button'], a.postings-btn, .btn-apply",
        },
        // Wait for the application form URL to load
        { type: "WAIT_FOR", target: "[data-qa='application-form'], #application-form" },
      ],
    },
    {
      state: "UPLOAD_RESUME",
      expectedClassifier: "lever_resume_upload",
      actions: [
        {
          type: "UPLOAD",
          target: "input.resume-file-input, input[type='file'][name='resume']",
          value: "resumeFile",
        },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "WAIT_FOR_PARSE",
      expectedClassifier: "lever_personal_info",
      actions: [
        // Lever parses resume and pre-fills the name/email fields
        { type: "WAIT_FOR", target: "[data-qa='name-input'], input[name='name']" },
      ],
    },
    {
      state: "VALIDATE_PARSED_PROFILE",
      expectedClassifier: "lever_personal_info",
      actions: [
        { type: "READ_TEXT", target: "[data-qa='name-input'], input[name='name']" },
        { type: "READ_TEXT", target: "[data-qa='email-input'], input[name='email']" },
      ],
    },
    {
      state: "FILL_REQUIRED_FIELDS",
      expectedClassifier: "lever_personal_info",
      actions: [
        // Lever uses a single name field (not split first/last)
        { type: "TYPE", target: "[data-qa='name-input'], input[name='name']", value: "candidate.name" },
        { type: "TYPE", target: "[data-qa='email-input'], input[name='email']", value: "candidate.email" },
        { type: "TYPE", target: "[data-qa='phone-input'], input[name='phone']", value: "candidate.phone" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "ANSWER_SCREENING_QUESTIONS",
      expectedClassifier: "lever_application_questions",
      actions: [
        { type: "EXTRACT_FIELDS" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "REVIEW_DISCLOSURES",
      expectedClassifier: "lever_eeo_disclosures",
      actions: [
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "PRE_SUBMIT_CHECK",
      expectedClassifier: "lever_application_form",
      actions: [
        { type: "SCREENSHOT" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "SUBMIT",
      expectedClassifier: "lever_application_form",
      actions: [
        {
          type: "CLICK",
          target:
            "[data-qa='btn-submit-application'], button[type='submit'], input[type='submit']",
        },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "CAPTURE_CONFIRMATION",
      expectedClassifier: "lever_confirmation",
      actions: [
        { type: "SCREENSHOT" },
        { type: "READ_TEXT", target: ".confirmation, [data-qa='confirmation']" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Direct apply flow: navigate to /apply URL, skip the listing step
// ---------------------------------------------------------------------------

/**
 * Some entry points (saved links, ATS redirects) go directly to the /apply URL.
 * This flow skips OPEN_JOB_PAGE / DETECT_APPLY_ENTRY and starts immediately
 * at the application form.
 */
export const directApplyFlow: PathTemplate = {
  name: "lever_direct_apply",
  steps: [
    {
      state: "OPEN_JOB_PAGE",
      expectedUrl: "jobs\\.lever\\.co/[^/]+/[0-9a-f\\-]{36}/apply",
      expectedClassifier: "lever_application_form",
      actions: [
        { type: "NAVIGATE", target: "jobUrl" },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "DETECT_APPLY_ENTRY",
      expectedClassifier: "lever_application_form",
      actions: [
        // Already on the form — verify form is present and scroll to top
        { type: "WAIT_FOR", target: "[data-qa='application-form'], #application-form" },
      ],
    },
    {
      state: "UPLOAD_RESUME",
      expectedClassifier: "lever_resume_upload",
      actions: [
        {
          type: "UPLOAD",
          target: "input.resume-file-input, input[type='file'][name='resume']",
          value: "resumeFile",
        },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "WAIT_FOR_PARSE",
      expectedClassifier: "lever_personal_info",
      actions: [
        { type: "WAIT_FOR", target: "[data-qa='name-input'], input[name='name']" },
      ],
    },
    {
      state: "VALIDATE_PARSED_PROFILE",
      expectedClassifier: "lever_personal_info",
      actions: [
        { type: "READ_TEXT", target: "[data-qa='name-input'], input[name='name']" },
        { type: "READ_TEXT", target: "[data-qa='email-input'], input[name='email']" },
      ],
    },
    {
      state: "FILL_REQUIRED_FIELDS",
      expectedClassifier: "lever_personal_info",
      actions: [
        { type: "TYPE", target: "[data-qa='name-input'], input[name='name']", value: "candidate.name" },
        { type: "TYPE", target: "[data-qa='email-input'], input[name='email']", value: "candidate.email" },
        { type: "TYPE", target: "[data-qa='phone-input'], input[name='phone']", value: "candidate.phone" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "ANSWER_SCREENING_QUESTIONS",
      expectedClassifier: "lever_application_questions",
      actions: [
        { type: "EXTRACT_FIELDS" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "REVIEW_DISCLOSURES",
      expectedClassifier: "lever_eeo_disclosures",
      actions: [
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "PRE_SUBMIT_CHECK",
      expectedClassifier: "lever_application_form",
      actions: [
        { type: "SCREENSHOT" },
        { type: "DOM_SNAPSHOT" },
      ],
    },
    {
      state: "SUBMIT",
      expectedClassifier: "lever_application_form",
      actions: [
        {
          type: "CLICK",
          target:
            "[data-qa='btn-submit-application'], button[type='submit'], input[type='submit']",
        },
        { type: "SCREENSHOT" },
      ],
    },
    {
      state: "CAPTURE_CONFIRMATION",
      expectedClassifier: "lever_confirmation",
      actions: [
        { type: "SCREENSHOT" },
        { type: "READ_TEXT", target: ".confirmation, [data-qa='confirmation']" },
      ],
    },
  ],
};

export const leverPathTemplates: PathTemplate[] = [
  viaJobListingFlow,
  directApplyFlow,
];
