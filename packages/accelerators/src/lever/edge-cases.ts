/**
 * Known Lever-specific quirks, exceptions, and handling notes.
 *
 * Each edge case is keyed by a stable identifier and documents:
 * - description: what the quirk is
 * - detection: how to detect it (selectors, URL patterns, text signals)
 * - mitigation: the recommended deterministic handling strategy
 * - severity: impact level if unhandled
 */

export interface LeverEdgeCase {
  id: string;
  description: string;
  detection: {
    selectors?: string[];
    urlPatterns?: string[];
    textPatterns?: string[];
  };
  mitigation: string;
  severity: "low" | "medium" | "high";
}

export const leverEdgeCases: LeverEdgeCase[] = [
  {
    id: "location_places_autocomplete",
    description:
      "Lever's location field is an async Google Places autocomplete. " +
      "Typing into it triggers an API call; the dropdown results load " +
      "asynchronously and a standard select interaction will not work. " +
      "The field does not accept free-text submission without selecting from the list.",
    detection: {
      selectors: [
        ".location-input",
        "input[name='location']",
        "[data-qa='location-input']",
        ".pac-container", // Google Places dropdown container
      ],
      textPatterns: ["Start typing your location"],
    },
    mitigation:
      "Type the city/region, then wait up to 3s for .pac-container results to appear. " +
      "Click the first matching .pac-item. " +
      "If the .pac-container does not appear, the field may accept plain text — submit as-is.",
    severity: "medium",
  },
  {
    id: "single_name_field",
    description:
      "Lever stores the applicant's full name in a single 'name' field, unlike Greenhouse " +
      "which splits into first_name and last_name. Submitting a split value or leaving it " +
      "in split format will cause validation errors.",
    detection: {
      selectors: [
        "input[name='name']",
        "[data-qa='name-input']",
      ],
    },
    mitigation:
      "Always join firstName and lastName into a single full-name string before filling. " +
      'Use the format "First Last". Do not split or truncate.',
    severity: "high",
  },
  {
    id: "resume_import_linkedin_indeed",
    description:
      "Lever offers 'Apply with LinkedIn' and 'Apply with Indeed' import buttons that " +
      "trigger OAuth popups. These paths auto-fill fields from the candidate's social profile " +
      "but are unreliable for automation due to OAuth redirects and popup handling.",
    detection: {
      selectors: [
        ".resume-linkedin-input, [data-qa='linkedin-resume-import']",
        ".resume-indeed-input, [data-qa='indeed-resume-import']",
        "button.apply-with-linkedin",
      ],
      textPatterns: ["Apply with LinkedIn", "Apply with Indeed", "Import from LinkedIn"],
    },
    mitigation:
      "Always use the file upload path. Never click the LinkedIn or Indeed import buttons.",
    severity: "medium",
  },
  {
    id: "resume_parse_delay",
    description:
      "After resume upload, Lever typically parses the document and auto-populates " +
      "name, email, phone, and org fields. This parse takes 2–8 seconds. " +
      "Fields will appear empty or show a loading indicator during the parse window.",
    detection: {
      selectors: [
        "input[name='name'][value='']",
        "[data-qa='name-input'][value='']",
        ".resume-parsing-indicator",
      ],
    },
    mitigation:
      "After upload, wait up to 10s for the name field to become non-empty. " +
      "If still empty after timeout, proceed with manual fill from candidate profile.",
    severity: "medium",
  },
  {
    id: "dynamic_required_fields",
    description:
      "Some Lever application questions and custom fields show or hide based on " +
      "prior answers. A field that is conditionally shown may become required only " +
      "after another field is answered. The HTML 'required' attribute may not be set " +
      "until the condition is triggered.",
    detection: {
      selectors: [
        "[data-qa='custom-question']",
        ".application-question[data-required]",
        ".conditional-question",
      ],
    },
    mitigation:
      "After filling each section, re-scan for newly visible required fields " +
      "before advancing. Check both the 'required' attribute and '*' in the label.",
    severity: "medium",
  },
  {
    id: "embedded_lever_form",
    description:
      "Some companies embed the Lever apply form in an iframe on their own careers " +
      "site rather than linking to jobs.lever.co directly. " +
      "The form URL inside the iframe will be jobs.lever.co/…/apply.",
    detection: {
      selectors: [
        "iframe[src*='jobs.lever.co']",
        "iframe[src*='hire.lever.co']",
      ],
    },
    mitigation:
      "Detect the iframe and switch Playwright frame context to it. " +
      "Then proceed with standard Lever selectors inside the frame.",
    severity: "high",
  },
  {
    id: "apply_confirmation_url_variant",
    description:
      "Lever confirms submissions in two ways: a URL-based confirmation page " +
      "(/apply/confirmation or /apply?confirmation=true) or an in-page flash message. " +
      "The exact pattern depends on the Lever version and employer customisation.",
    detection: {
      urlPatterns: [
        "jobs\\.lever\\.co/.+/apply/confirmation",
        "jobs\\.lever\\.co/.+/apply\\?confirmation",
      ],
      selectors: [
        ".confirmation",
        "[data-qa='confirmation']",
        ".flash.success",
        ".application-confirmation",
      ],
    },
    mitigation:
      "Check both the URL and the DOM for confirmation signals. " +
      "Capture a screenshot of whichever signal is present first.",
    severity: "low",
  },
  {
    id: "referral_source_dropdown",
    description:
      "Lever boards often include an optional 'How did you hear about us?' dropdown " +
      "that lists referral sources. This field is almost always optional.",
    detection: {
      selectors: [
        "select[name='source']",
        "[data-qa='source-select']",
        "select[id*='source']",
      ],
      textPatterns: ["How did you hear about us", "Referral source"],
    },
    mitigation:
      "If the referral source dropdown is present, select the most appropriate " +
      "option from the candidate's application data. If no preference is recorded, " +
      "skip the field (it is optional).",
    severity: "low",
  },
  {
    id: "optional_cover_letter_textarea",
    description:
      "Lever provides an 'Additional information' or 'Cover letter' textarea at the " +
      "bottom of the form. The field label varies by employer. Some boards make it " +
      "required; most leave it optional.",
    detection: {
      selectors: [
        "textarea[name='comments']",
        "[data-qa='additional-information-textarea']",
        "textarea.additional-info",
      ],
      textPatterns: ["Additional information", "Cover letter", "Anything else you'd like to share"],
    },
    mitigation:
      "Check whether the field is required (HTML attribute or asterisk in label). " +
      "If optional, fill with the candidate's prepared cover letter text if available. " +
      "If not available and optional, leave blank.",
    severity: "low",
  },
  {
    id: "work_authorization_question",
    description:
      "Many Lever boards include a work authorisation / visa sponsorship question " +
      "among the application questions. The question text and answer options vary. " +
      "Mismatching the answer format to what the ATS expects may cause a validation error.",
    detection: {
      selectors: [
        "[data-qa='custom-question']",
        "select[name*='authorized'], select[name*='visa'], select[name*='sponsorship']",
      ],
      textPatterns: [
        "work authorization",
        "authorized to work",
        "require sponsorship",
        "visa sponsorship",
      ],
    },
    mitigation:
      "Match the exact option text from the select/radio choices against the candidate's " +
      "work authorisation status from their profile. Use an exact string match to the " +
      "visible option label.",
    severity: "medium",
  },
  {
    id: "salary_expectations_question",
    description:
      "Some Lever boards ask for salary expectations as a free-text or numeric input. " +
      "Lever does not standardise this field; it is defined per-job by the employer.",
    detection: {
      selectors: [
        "input[name*='salary'], input[name*='compensation']",
        "[data-qa='custom-question'] input",
      ],
      textPatterns: [
        "Salary expectation",
        "Desired salary",
        "Expected compensation",
      ],
    },
    mitigation:
      "If the candidate has a salary expectation recorded, fill the field. " +
      "If the field is optional and no data is available, leave it blank.",
    severity: "low",
  },
  {
    id: "eeo_not_always_present",
    description:
      "EEO/EEOC questions are only shown on US-based job postings and only when " +
      "the employer has enabled them. The EEO section may be entirely absent " +
      "for international postings or for employers that have not enabled the feature.",
    detection: {
      selectors: [
        ".eeo-section",
        "[data-qa='eeo-section']",
      ],
    },
    mitigation:
      "Check for the presence of .eeo-section before attempting to fill EEO fields. " +
      "If absent, skip the REVIEW_DISCLOSURES step gracefully.",
    severity: "low",
  },
];

/**
 * Structured edge-case data suitable for serialisation into
 * AtsAccelerator.edgeCasesJson.
 */
export const leverEdgeCasesJson: Record<string, unknown> = Object.fromEntries(
  leverEdgeCases.map((ec) => [ec.id, ec]),
);

/** Lookup a specific Lever edge case by id. */
export function getLeverEdgeCase(id: string): LeverEdgeCase | undefined {
  return leverEdgeCases.find((ec) => ec.id === id);
}
