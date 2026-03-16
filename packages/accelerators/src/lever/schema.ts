import type { FormSchema, FormFieldSchema } from "@dejsol/core";

/**
 * Lever form field schema.
 *
 * Key structural differences from Greenhouse:
 * - Lever uses a SINGLE `name` field (not first_name + last_name).
 *   The full name is submitted as one value — do NOT split it.
 * - `org` is the current employer/company field (not a required field).
 * - data-qa attributes are the most reliable selectors.
 * - Location is an autocomplete backed by Google Places (async loading).
 * - Social/link fields use a section-per-link layout.
 */

// ---------------------------------------------------------------------------
// Personal information fields
// ---------------------------------------------------------------------------

export const personalInfoFields: FormFieldSchema[] = [
  {
    key: "name",
    label: "Full Name",
    type: "text",
    required: true,
    selector: "[data-qa='name-input'], input[name='name'], #name",
    mapTo: "candidate.name",
  },
  {
    key: "email",
    label: "Email Address",
    type: "email",
    required: true,
    selector: "[data-qa='email-input'], input[name='email'], #email",
    mapTo: "candidate.email",
  },
  {
    key: "phone",
    label: "Phone",
    type: "tel",
    required: false,
    selector: "[data-qa='phone-input'], input[name='phone'], #phone",
    mapTo: "candidate.phone",
  },
  {
    key: "org",
    label: "Current Company",
    type: "text",
    required: false,
    selector: "[data-qa='org-input'], input[name='org'], #org",
    mapTo: "candidate.profile.currentEmployer",
  },
];

// ---------------------------------------------------------------------------
// Location field
// ---------------------------------------------------------------------------

/**
 * Location in Lever is an async autocomplete field backed by Google Places.
 * Type the city/region and wait for the dropdown before selecting.
 */
export const locationField: FormFieldSchema = {
  key: "location",
  label: "Location",
  type: "text",
  required: false,
  selector:
    "[data-qa='location-input'], input[name='location'], .location-input, #location",
  mapTo: "candidate.location",
};

// ---------------------------------------------------------------------------
// Resume upload
// ---------------------------------------------------------------------------

export const resumeField: FormFieldSchema = {
  key: "resume",
  label: "Resume",
  type: "file",
  required: true,
  selector:
    "input.resume-file-input, input[type='file'][name='resume'], [data-qa='resume-file-upload']",
  mapTo: "candidate.resumeFile",
};

// ---------------------------------------------------------------------------
// Cover letter / additional info
// ---------------------------------------------------------------------------

/**
 * Lever surfaces a single "Additional information" or "Cover letter" textarea
 * rather than a dedicated cover letter upload.  Some boards label it
 * differently but the selector pattern is consistent.
 */
export const additionalInfoField: FormFieldSchema = {
  key: "comments",
  label: "Additional Information",
  type: "textarea",
  required: false,
  selector:
    "textarea[name='comments'], [data-qa='additional-information-textarea'], textarea.additional-info, #additional-information",
  mapTo: "candidate.coverLetterText",
};

// ---------------------------------------------------------------------------
// Social / link fields
// ---------------------------------------------------------------------------

export const linkFields: FormFieldSchema[] = [
  {
    key: "linkedin",
    label: "LinkedIn Profile",
    type: "text",
    required: false,
    selector:
      "[data-qa='linkedin-input'], input[name*='linkedin'], input[placeholder*='linkedin.com']",
    mapTo: "candidate.profile.links.linkedin",
  },
  {
    key: "github",
    label: "GitHub Profile",
    type: "text",
    required: false,
    selector:
      "[data-qa='github-input'], input[name*='github'], input[placeholder*='github.com']",
    mapTo: "candidate.profile.links.github",
  },
  {
    key: "twitter",
    label: "Twitter / X",
    type: "text",
    required: false,
    selector:
      "[data-qa='twitter-input'], input[name*='twitter'], input[placeholder*='twitter.com'], input[placeholder*='x.com']",
    mapTo: "candidate.profile.links.twitter",
  },
  {
    key: "portfolio",
    label: "Portfolio / Personal Website",
    type: "text",
    required: false,
    selector:
      "[data-qa='portfolio-input'], input[name*='portfolio'], input[name*='website']",
    mapTo: "candidate.profile.links.portfolio",
  },
];

// ---------------------------------------------------------------------------
// EEO / voluntary self-identification fields
// ---------------------------------------------------------------------------

export const eeoFields: FormFieldSchema[] = [
  {
    key: "gender",
    label: "Gender",
    type: "select",
    required: false,
    selector:
      "[data-qa='eeo-gender-select'], select[name*='gender'], .eeo-question select[name*='gender']",
    options: ["Male", "Female", "Non-binary", "I prefer not to say"],
  },
  {
    key: "race",
    label: "Race / Ethnicity",
    type: "select",
    required: false,
    selector:
      "[data-qa='eeo-race-select'], select[name*='race'], select[name*='ethnicity']",
    options: [
      "Hispanic or Latino",
      "White",
      "Black or African American",
      "Native Hawaiian or Other Pacific Islander",
      "Asian",
      "American Indian or Alaska Native",
      "Two or More Races",
      "I prefer not to say",
    ],
  },
  {
    key: "veteran_status",
    label: "Veteran Status",
    type: "select",
    required: false,
    selector:
      "[data-qa='eeo-veteran-select'], select[name*='veteran']",
    options: [
      "I am a veteran",
      "I am not a veteran",
      "I prefer not to say",
    ],
  },
  {
    key: "disability_status",
    label: "Disability Status",
    type: "select",
    required: false,
    selector:
      "[data-qa='eeo-disability-select'], select[name*='disability']",
    options: [
      "Yes, I have a disability, or have had one in the past",
      "No, I do not have a disability and have not had one in the past",
      "I do not wish to answer",
    ],
  },
];

// ---------------------------------------------------------------------------
// Assembled form schemas by page type
// ---------------------------------------------------------------------------

export const leverFormSchemas: FormSchema[] = [
  {
    pageType: "lever_personal_info",
    fields: [...personalInfoFields, locationField],
  },
  {
    pageType: "lever_resume_upload",
    fields: [resumeField],
  },
  {
    pageType: "lever_links",
    fields: linkFields,
  },
  {
    pageType: "lever_additional_info",
    fields: [additionalInfoField],
  },
  {
    pageType: "lever_eeo_disclosures",
    fields: eeoFields,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lookup a known Lever field by key. Returns undefined if not in the standard set. */
export function getLeverField(key: string): FormFieldSchema | undefined {
  const allFields: FormFieldSchema[] = [
    ...personalInfoFields,
    locationField,
    resumeField,
    additionalInfoField,
    ...linkFields,
    ...eeoFields,
  ];
  return allFields.find((f) => f.key === key);
}

/** Lookup a Lever form schema by page type. */
export function getLeverFormSchema(pageType: string): FormSchema | undefined {
  return leverFormSchemas.find((s) => s.pageType === pageType);
}
