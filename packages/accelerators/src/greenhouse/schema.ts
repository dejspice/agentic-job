import type { FormSchema, FormFieldSchema } from "@dejsol/core";

/**
 * Standard Greenhouse personal information fields.
 * These selectors are stable across most Greenhouse boards.
 */
export const personalInfoFields: FormFieldSchema[] = [
  {
    key: "first_name",
    label: "First Name",
    type: "text",
    required: true,
    selector: "#first_name",
    mapTo: "candidate.name",
  },
  {
    key: "last_name",
    label: "Last Name",
    type: "text",
    required: true,
    selector: "#last_name",
    mapTo: "candidate.name",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    selector: "#email",
    mapTo: "candidate.email",
  },
  {
    key: "phone",
    label: "Phone",
    type: "tel",
    required: false,
    selector: "#phone",
    mapTo: "candidate.phone",
  },
];

/**
 * Resume and cover letter upload fields.
 */
export const documentFields: FormFieldSchema[] = [
  {
    key: "resume",
    label: "Resume/CV",
    type: "file",
    required: true,
    selector: 'input[type="file"][id*="resume"]',
    mapTo: "candidate.resumeFile",
  },
  {
    key: "cover_letter",
    label: "Cover Letter",
    type: "file",
    required: false,
    selector: 'input[type="file"][id*="cover_letter"]',
    mapTo: "candidate.coverLetterFile",
  },
  {
    key: "resume_text",
    label: "Resume Text",
    type: "textarea",
    required: false,
    selector: "#resume_text",
  },
  {
    key: "cover_letter_text",
    label: "Cover Letter Text",
    type: "textarea",
    required: false,
    selector: "#cover_letter_text",
  },
];

/**
 * Common link/URL fields Greenhouse boards often include.
 */
export const linkFields: FormFieldSchema[] = [
  {
    key: "linkedin_url",
    label: "LinkedIn Profile",
    type: "text",
    required: false,
    selector: 'input[name*="linkedin"], input[id*="linkedin"]',
    mapTo: "candidate.profile.links.linkedin",
  },
  {
    key: "website_url",
    label: "Website",
    type: "text",
    required: false,
    selector: 'input[name*="website"], input[id*="website"]',
    mapTo: "candidate.profile.links.website",
  },
  {
    key: "portfolio_url",
    label: "Portfolio",
    type: "text",
    required: false,
    selector: 'input[name*="portfolio"], input[id*="portfolio"]',
    mapTo: "candidate.profile.links.portfolio",
  },
];

/**
 * EEOC / voluntary self-identification fields.
 * These are typically optional and appear on US-based listings.
 */
export const eeocFields: FormFieldSchema[] = [
  {
    key: "gender",
    label: "Gender",
    type: "select",
    required: false,
    selector: 'select[id*="gender"], select[name*="gender"]',
    options: ["Male", "Female", "Decline to self-identify"],
  },
  {
    key: "race",
    label: "Race / Ethnicity",
    type: "select",
    required: false,
    selector: 'select[id*="race"], select[name*="race"]',
    options: [
      "Hispanic or Latino",
      "White",
      "Black or African American",
      "Native Hawaiian or Other Pacific Islander",
      "Asian",
      "American Indian or Alaska Native",
      "Two or More Races",
      "Decline to self-identify",
    ],
  },
  {
    key: "veteran_status",
    label: "Veteran Status",
    type: "select",
    required: false,
    selector: 'select[id*="veteran"], select[name*="veteran"]',
    options: [
      "I am a veteran",
      "I am not a veteran",
      "Decline to self-identify",
    ],
  },
  {
    key: "disability_status",
    label: "Disability Status",
    type: "select",
    required: false,
    selector: 'select[id*="disability"], select[name*="disability"]',
    options: [
      "Yes, I have a disability",
      "No, I do not have a disability",
      "I do not wish to answer",
    ],
  },
];

/**
 * Assembled form schemas by Greenhouse page type.
 */
export const greenhouseFormSchemas: FormSchema[] = [
  {
    pageType: "personal_info",
    fields: personalInfoFields,
  },
  {
    pageType: "resume_upload",
    fields: documentFields,
  },
  {
    pageType: "links",
    fields: linkFields,
  },
  {
    pageType: "eeoc_disclosures",
    fields: eeocFields,
  },
];

/**
 * Lookup a known field by key. Returns undefined if the key is not
 * part of the standard Greenhouse field set.
 */
export function getGreenhouseField(
  key: string,
): FormFieldSchema | undefined {
  const allFields = [
    ...personalInfoFields,
    ...documentFields,
    ...linkFields,
    ...eeocFields,
  ];
  return allFields.find((f) => f.key === key);
}

/**
 * Lookup form schema by page type.
 */
export function getGreenhouseFormSchema(
  pageType: string,
): FormSchema | undefined {
  return greenhouseFormSchemas.find((s) => s.pageType === pageType);
}
