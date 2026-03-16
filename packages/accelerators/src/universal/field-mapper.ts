import type { FormFieldSchema, FieldMapping } from "@dejsol/core";

// ─── Extracted field hint ─────────────────────────────────────────────────

/**
 * Raw field information extracted from the DOM before mapping.
 * Browser-worker's EXTRACT_FIELDS command produces data convertible to this shape.
 */
export interface FieldHint {
  tag: "input" | "select" | "textarea";
  inputType?: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  required?: boolean;
  selector: string;
  options?: string[];
}

// ─── Mapping result ───────────────────────────────────────────────────────

export interface MappedField {
  normalizedKey: string;
  candidatePath: string;
  confidence: number;
  source: "deterministic" | "fallback";
}

// ─── Fallback hook for future intelligence integration ────────────────────

/**
 * Async fallback for fields that cannot be mapped deterministically.
 * The intelligence package will implement this interface.
 */
export interface FieldMapperFallback {
  mapField(hint: FieldHint): Promise<MappedField | null>;
}

// ─── Pattern table ────────────────────────────────────────────────────────

interface FieldPattern {
  /** Regex tested against lower-cased name, id, label, placeholder, ariaLabel */
  pattern: RegExp;
  normalizedKey: string;
  candidatePath: string;
  fieldType: FormFieldSchema["type"];
}

const FIELD_PATTERNS: FieldPattern[] = [
  { pattern: /\bfirst[_\s-]?name\b/, normalizedKey: "first_name", candidatePath: "candidate.name", fieldType: "text" },
  { pattern: /\blast[_\s-]?name\b/, normalizedKey: "last_name", candidatePath: "candidate.name", fieldType: "text" },
  { pattern: /\bfull[_\s-]?name\b/, normalizedKey: "full_name", candidatePath: "candidate.name", fieldType: "text" },
  { pattern: /\be[\s_-]?mail\b/, normalizedKey: "email", candidatePath: "candidate.email", fieldType: "email" },
  { pattern: /\bphone\b|\bmobile\b|\btelephone\b/, normalizedKey: "phone", candidatePath: "candidate.phone", fieldType: "tel" },
  { pattern: /\bresume\b|\bcv\b/, normalizedKey: "resume", candidatePath: "candidate.resumeFile", fieldType: "file" },
  { pattern: /\bcover[_\s-]?letter\b/, normalizedKey: "cover_letter", candidatePath: "candidate.coverLetterFile", fieldType: "file" },
  { pattern: /\blinkedin\b/, normalizedKey: "linkedin_url", candidatePath: "candidate.profile.links.linkedin", fieldType: "text" },
  { pattern: /\bwebsite\b|\bportfolio\b|\bpersonal[_\s-]?url\b/, normalizedKey: "website_url", candidatePath: "candidate.profile.links.website", fieldType: "text" },
  { pattern: /\bgithub\b/, normalizedKey: "github_url", candidatePath: "candidate.profile.links.github", fieldType: "text" },
  { pattern: /\bcity\b/, normalizedKey: "city", candidatePath: "candidate.profile.city", fieldType: "text" },
  { pattern: /\bstate\b|\bprovince\b|\bregion\b/, normalizedKey: "state", candidatePath: "candidate.profile.state", fieldType: "text" },
  { pattern: /\bcountry\b/, normalizedKey: "country", candidatePath: "candidate.profile.country", fieldType: "select" },
  { pattern: /\bzip\b|\bpostal[_\s-]?code\b/, normalizedKey: "postal_code", candidatePath: "candidate.profile.postalCode", fieldType: "text" },
  { pattern: /\baddress\b|\bstreet\b/, normalizedKey: "address", candidatePath: "candidate.profile.address", fieldType: "text" },
  { pattern: /\bsalary\b|\bcompensation\b|\bdesired[_\s-]?pay\b/, normalizedKey: "salary_expectation", candidatePath: "candidate.salaryExpectation", fieldType: "text" },
  { pattern: /\bstart[_\s-]?date\b|\bavailab/, normalizedKey: "start_date", candidatePath: "candidate.startDate", fieldType: "date" },
  { pattern: /\bgender\b/, normalizedKey: "gender", candidatePath: "candidate.eeoc.gender", fieldType: "select" },
  { pattern: /\brace\b|\bethnicity\b/, normalizedKey: "race", candidatePath: "candidate.eeoc.race", fieldType: "select" },
  { pattern: /\bveteran\b/, normalizedKey: "veteran_status", candidatePath: "candidate.eeoc.veteranStatus", fieldType: "select" },
  { pattern: /\bdisability\b/, normalizedKey: "disability_status", candidatePath: "candidate.eeoc.disabilityStatus", fieldType: "select" },
  { pattern: /\bauthori[sz]ed?\b.*\bwork\b|\bwork\b.*\bauthori[sz]/, normalizedKey: "work_authorization", candidatePath: "candidate.workAuthorization", fieldType: "select" },
  { pattern: /\bsponsorship\b|\bvisa\b/, normalizedKey: "sponsorship_required", candidatePath: "candidate.sponsorshipRequired", fieldType: "select" },
  { pattern: /\byears?\b.*\bexperience\b|\bexperience\b.*\byears?\b/, normalizedKey: "years_experience", candidatePath: "candidate.profile.yearsOfExperience", fieldType: "text" },
  { pattern: /\beducation\b|\bdegree\b/, normalizedKey: "education", candidatePath: "candidate.profile.education", fieldType: "select" },
];

// ─── Deterministic mapper ─────────────────────────────────────────────────

function collectSignals(hint: FieldHint): string {
  return [hint.name, hint.id, hint.label, hint.placeholder, hint.ariaLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Attempt deterministic field mapping using label/name/id/placeholder heuristics.
 * Returns null if no pattern matches.
 */
export function mapFieldDeterministic(hint: FieldHint): MappedField | null {
  const signals = collectSignals(hint);
  if (!signals) return null;

  for (const fp of FIELD_PATTERNS) {
    if (fp.pattern.test(signals)) {
      return {
        normalizedKey: fp.normalizedKey,
        candidatePath: fp.candidatePath,
        confidence: 0.8,
        source: "deterministic",
      };
    }
  }

  return null;
}

/**
 * Map an array of extracted field hints.
 * Uses deterministic matching first; if no match, calls the optional
 * fallback (future intelligence package hook).
 */
export async function mapFields(
  hints: FieldHint[],
  fallback?: FieldMapperFallback,
): Promise<Map<string, MappedField>> {
  const results = new Map<string, MappedField>();

  for (const hint of hints) {
    const key = hint.selector;

    const deterministic = mapFieldDeterministic(hint);
    if (deterministic) {
      results.set(key, deterministic);
      continue;
    }

    if (fallback) {
      const fallbackResult = await fallback.mapField(hint);
      if (fallbackResult) {
        results.set(key, fallbackResult);
      }
    }
  }

  return results;
}

/**
 * Convert a MappedField to the core FieldMapping shape for storage
 * in PortalFingerprint.fieldMappingsJson.
 */
export function toFieldMapping(
  hint: FieldHint,
  mapped: MappedField,
): FieldMapping {
  return {
    portalFieldLabel: hint.label ?? hint.placeholder ?? hint.name ?? "",
    normalizedKey: mapped.normalizedKey,
    selector: hint.selector,
    type: hint.inputType ?? hint.tag,
    confidence: mapped.confidence,
  };
}

/**
 * Infer the FormFieldSchema type from a raw FieldHint.
 */
export function inferFieldType(hint: FieldHint): FormFieldSchema["type"] {
  if (hint.tag === "select") return "select";
  if (hint.tag === "textarea") return "textarea";

  switch (hint.inputType) {
    case "email": return "email";
    case "tel": return "tel";
    case "file": return "file";
    case "date": return "date";
    case "number": return "number";
    case "checkbox": return "checkbox";
    case "radio": return "radio";
    default: return "text";
  }
}
