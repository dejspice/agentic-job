/**
 * Known Greenhouse-specific quirks, exceptions, and handling notes.
 *
 * Each edge case is keyed by a stable identifier and includes:
 * - description: what the quirk is
 * - detection: how to detect it (selectors, URL patterns, text)
 * - mitigation: recommended handling strategy
 */

export interface GreenhouseEdgeCase {
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

export const greenhouseEdgeCases: GreenhouseEdgeCase[] = [
  {
    id: "resume_parse_delay",
    description:
      "After resume upload, Greenhouse may take 2-10 seconds to parse and auto-fill fields. " +
      "Fields may appear empty during this window.",
    detection: {
      selectors: ['input[type="file"][id*="resume"]', "#first_name[value='']"],
    },
    mitigation:
      "Wait up to 10s after upload for #first_name to have a non-empty value before validating parsed profile. " +
      "If still empty after timeout, proceed with manual fill.",
    severity: "medium",
  },
  {
    id: "optional_account_creation",
    description:
      "Some Greenhouse boards prompt applicants to create an account or sign in before applying. " +
      "This gate is optional and can be bypassed by scrolling to the application form.",
    detection: {
      selectors: [
        "#signin_link",
        'a[href*="sign_in"]',
        ".existing-account-prompt",
      ],
      textPatterns: ["Already have an account?", "Sign in"],
    },
    mitigation:
      "Skip account creation. Scroll directly to #application or click 'Apply without account' if present.",
    severity: "low",
  },
  {
    id: "apply_with_linkedin",
    description:
      "Greenhouse boards may show an 'Apply with LinkedIn' button that triggers an OAuth popup. " +
      "This path is unreliable for automation.",
    detection: {
      selectors: [".apply-with-linkedin", 'a[href*="linkedin.com/oauth"]'],
      textPatterns: ["Apply with LinkedIn"],
    },
    mitigation:
      "Always use the manual application form. Never click the LinkedIn OAuth button.",
    severity: "medium",
  },
  {
    id: "cover_letter_toggle",
    description:
      "The cover letter field may be hidden behind a 'Paste' or 'Attach' toggle. " +
      "The file input and textarea are mutually exclusive.",
    detection: {
      selectors: [".attach-or-paste", "#cover_letter_text", "#cover_letter"],
    },
    mitigation:
      "If file upload is available, prefer file. If textarea is visible, paste text. " +
      "Check which variant is active before interacting.",
    severity: "low",
  },
  {
    id: "eeoc_separate_page",
    description:
      "On some boards, EEOC / voluntary self-identification questions appear on a separate " +
      "page after the main application form, rather than inline.",
    detection: {
      selectors: ["#demographic_questions"],
      urlPatterns: ["boards\\.greenhouse\\.io/.+/jobs/\\d+/eeoc"],
      textPatterns: ["Voluntary Self-Identification"],
    },
    mitigation:
      "Detect whether EEOC fields are inline or on a separate page. " +
      "If separate, navigate to the EEOC page after submitting the main form.",
    severity: "low",
  },
  {
    id: "custom_question_types",
    description:
      "Screening questions can be free-text, single-select, multi-select, or yes/no. " +
      "The input type varies by question and is not always predictable from the DOM structure alone.",
    detection: {
      selectors: [
        'select[id*="job_application_answers"]',
        'input[type="radio"][id*="job_application_answers"]',
        'input[type="checkbox"][id*="job_application_answers"]',
        'textarea[id*="job_application_answers"]',
        'input[type="text"][id*="job_application_answers"]',
      ],
    },
    mitigation:
      "Extract the field type from the DOM element tag and type attribute. " +
      "Fall back to LLM classification only if the element type is ambiguous.",
    severity: "medium",
  },
  {
    id: "location_dropdown_async",
    description:
      "Some Greenhouse forms include a location autocomplete dropdown that loads options " +
      "asynchronously after typing. Standard select interactions will not work.",
    detection: {
      selectors: [
        'input[id*="location"]',
        ".autocomplete-results",
        ".location-autocomplete",
      ],
    },
    mitigation:
      "Type location text, wait for autocomplete results to appear (up to 3s), " +
      "then click the first matching option.",
    severity: "medium",
  },
  {
    id: "iframe_embedded_form",
    description:
      "Some companies embed the Greenhouse application form inside an iframe on their " +
      "own careers page rather than linking to boards.greenhouse.io directly.",
    detection: {
      selectors: ['iframe[src*="boards.greenhouse.io"]'],
    },
    mitigation:
      "Detect the iframe, switch Playwright context to the iframe, then proceed " +
      "with standard Greenhouse selectors inside the frame.",
    severity: "high",
  },
  {
    id: "required_field_asterisk",
    description:
      "Required fields are marked with an asterisk (*) in the label, but the HTML attribute " +
      "'required' may not always be set on the input element.",
    detection: {
      selectors: ['label:has-text("*")'],
      textPatterns: ["*"],
    },
    mitigation:
      "Check both the 'required' HTML attribute and the presence of '*' in the label " +
      "text to determine whether a field is mandatory.",
    severity: "low",
  },
  {
    id: "multi_location_job",
    description:
      "Jobs posted to multiple locations may show a location selector before the application form. " +
      "The wrong location may pre-fill if the candidate's IP geo doesn't match.",
    detection: {
      selectors: [
        'select[id*="location"]',
        "#job_application_location",
      ],
      textPatterns: ["Select a location"],
    },
    mitigation:
      "If a location selector is present, select the correct location before proceeding " +
      "with the application. Use the job's location field from the job listing.",
    severity: "medium",
  },
];

/**
 * Structured edge-case data suitable for serialization into
 * AtsAccelerator.edgeCasesJson.
 */
export const greenhouseEdgeCasesJson: Record<string, unknown> = Object.fromEntries(
  greenhouseEdgeCases.map((ec) => [ec.id, ec]),
);

/**
 * Lookup a specific edge case by id.
 */
export function getGreenhouseEdgeCase(
  id: string,
): GreenhouseEdgeCase | undefined {
  return greenhouseEdgeCases.find((ec) => ec.id === id);
}
