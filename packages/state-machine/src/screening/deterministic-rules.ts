/**
 * Deterministic screening-question answer engine.
 *
 * Table-driven: each rule declares a label pattern (regex tested against
 * the normalized question text) and a resolution strategy — either a fixed
 * literal value or a dot-path into the candidate data bag.
 *
 * Rules are evaluated in declaration order; first match wins.
 *
 * This module intentionally does NOT call the intelligence package.
 * Unknown questions produce a "no_match" result so callers can decide
 * whether to skip, escalate, or defer to an LLM layer later.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestionInteraction = "text" | "react-select";

export interface ScreeningRule {
  /** Human-readable name for logging / test assertions. */
  name: string;
  /** Regex tested against the lowercased, whitespace-collapsed label. */
  pattern: RegExp;
  /** How to resolve the answer value. */
  answer:
    | { kind: "literal"; value: string }
    | { kind: "dataKey"; path: string; fallback?: string };
  /** How to interact with the field on the page. */
  interaction: QuestionInteraction;
  /**
   * Optional short search string to type into React Select's filter.
   * When present, this is typed instead of the full answer value so that
   * React Select's contains-filter reliably shows matching options.
   * Resolved from the data bag if prefixed with "dataKey:", otherwise literal.
   */
  searchSeed?: string;
}

export interface MatchResult {
  matched: true;
  rule: ScreeningRule;
  value: string;
}

export interface NoMatchResult {
  matched: false;
  label: string;
}

export type RuleMatchOutcome = MatchResult | NoMatchResult;

// ---------------------------------------------------------------------------
// Rule table
// ---------------------------------------------------------------------------

export const SCREENING_RULES: readonly ScreeningRule[] = [
  // ── LinkedIn ──────────────────────────────────────────────────────────
  {
    name: "linkedin_profile",
    pattern: /linkedin/i,
    answer: { kind: "dataKey", path: "candidate.linkedin", fallback: "N/A" },
    interaction: "text",
  },

  // ── Visa / sponsorship ────────────────────────────────────────────────
  {
    name: "visa_sponsorship",
    pattern: /visa\s*sponsor|require.*sponsor|need.*sponsor|sponsor.*visa/i,
    answer: { kind: "dataKey", path: "candidate.requireSponsorship", fallback: "No" },
    interaction: "react-select",
  },

  // ── Work authorization ────────────────────────────────────────────────
  {
    name: "work_authorization",
    pattern: /authorized?\s*(to\s*)?work|legally\s*work|eligible\s*to\s*work|work\s*authori/i,
    answer: { kind: "dataKey", path: "candidate.authorizedToWork", fallback: "Yes" },
    interaction: "react-select",
  },

  // ── How long / years of experience in role ────────────────────────────
  // Must come BEFORE "previously worked as" — both can appear in the same
  // question text ("For how long have you previously worked as ..."), and
  // "how long" is the more specific signal.
  {
    name: "experience_duration",
    pattern: /how\s*long\s*have\s*you|years?\s*of\s*experience|how\s*many\s*years|length\s*of.*experience|for\s*how\s*long/i,
    answer: { kind: "dataKey", path: "candidate.experienceDuration", fallback: "5+ years" },
    interaction: "react-select",
    searchSeed: "10",
  },

  // ── Previously worked as <role> ───────────────────────────────────────
  {
    name: "previously_worked_as",
    pattern: /have\s*you\s*(ever\s*)?previously\s*worked|previously\s*worked\s*as|prior\s*experience\s*as|have\s*you\s*(ever\s*)?worked\s*as/i,
    answer: { kind: "dataKey", path: "candidate.previouslyWorkedAsRole", fallback: "Yes" },
    interaction: "react-select",
  },

  // ── Industry/domain experience (freeform text) ────────────────────────
  // Must come BEFORE industry_career — labels containing "possess" + "industry"
  // + "experience" are freeform text questions, not dropdown selectors.
  {
    name: "industry_experience_text",
    pattern: /possess.*experience|fintech.*experience|payments.*experience/i,
    answer: { kind: "dataKey", path: "candidate.industryExperience", fallback: "Yes, 8 years in SaaS and fintech." },
    interaction: "text",
  },

  // ── Industry / career domain ──────────────────────────────────────────
  {
    name: "industry_career",
    pattern: /which.*industry|best\s*describes.*industry|career\s*in$|analytics\s*career|professional\s*background/i,
    answer: { kind: "dataKey", path: "candidate.industry", fallback: "SaaS / Software" },
    interaction: "react-select",
    searchSeed: "B2B",
  },

  // ── Scope / level of analytics work ───────────────────────────────────
  {
    name: "analytics_scope",
    pattern: /scope\s*of.*analytics|analytics\s*work|level\s*of.*analytics/i,
    answer: { kind: "dataKey", path: "candidate.analyticsScope", fallback: "Defining KPIs and building analytics frameworks" },
    interaction: "react-select",
    searchSeed: "KPI",
  },

  // ── Python / R / technical skill proficiency ──────────────────────────
  {
    name: "python_r_experience",
    pattern: /python|(\br\b).*data\s*analysis|programming.*data|coding.*analytics/i,
    answer: { kind: "dataKey", path: "candidate.pythonExperience", fallback: "I use Python or R regularly for data analysis" },
    interaction: "react-select",
    searchSeed: "regularly",
  },

  // ── Portfolio / case studies ───────────────────────────────────────────
  {
    name: "portfolio_case_studies",
    pattern: /portfolio|case\s*stud|work\s*sample|share.*during.*interview/i,
    answer: { kind: "dataKey", path: "candidate.hasPortfolio", fallback: "Yes" },
    interaction: "react-select",
  },

  // ── Worked at this company before ─────────────────────────────────────
  // Must be specific enough not to match "worked for Robinhood" with "Yes"
  {
    name: "worked_here_before",
    pattern: /previously\s*employed|worked\s*.*before|former\s*employee|ever\s*worked\s*(for|at)\s*\w|ever\s*been\s*employed|employee.*intern.*contractor/i,
    answer: { kind: "dataKey", path: "candidate.workedHereBefore", fallback: "No" },
    interaction: "react-select",
    searchSeed: "never",
  },

  // ── Why this company / role (free-text motivation) ────────────────────
  {
    name: "why_company",
    pattern: /why\s+\w+\??\s*$|why\s+are\s+you\s+interested|why\s+do\s+you\s+want|what\s+draws\s+you|what\s+excites\s+you|what\s+interests\s+you|why\s+this\s+(company|role|position|team|opportunity)/i,
    answer: { kind: "dataKey", path: "candidate.whyCompany", fallback: "I am deeply interested in the mission and the technical challenges here. My background in analytics and data-driven product development aligns directly with the work being done, and I am excited to contribute to a team that values rigorous thinking and measurable impact." },
    interaction: "text",
  },

  // ── Open to in-person / office work ───────────────────────────────────
  {
    name: "open_to_in_person",
    pattern: /open\s*to.*in-person|working\s*in-person|in.person.*office|office.*\d+%|25%.*time/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── AI policy acknowledgment ───────────────────────────────────────────
  {
    name: "ai_policy",
    pattern: /ai\s*policy|ai.*application|artificial\s*intelligence.*policy/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── How did you hear about this role ─────────────────────────────────
  {
    name: "referral_source",
    pattern: /how\s*did\s*you\s*hear|where\s*did\s*you\s*hear|how.*find.*role|how.*learn.*position|source.*application/i,
    answer: { kind: "literal", value: "Other" },
    interaction: "react-select",
    searchSeed: "Other",
  },

  // ── Willing to relocate ───────────────────────────────────────────────
  {
    name: "willing_to_relocate",
    pattern: /willing\s*to\s*relocate|open\s*to\s*relocation/i,
    answer: { kind: "dataKey", path: "candidate.willingToRelocate", fallback: "Yes" },
    interaction: "react-select",
  },

  // ── Salary expectation ────────────────────────────────────────────────
  {
    name: "salary_expectation",
    pattern: /salary|compensation|pay\s*expectation|desired\s*pay/i,
    answer: { kind: "dataKey", path: "candidate.salaryRange", fallback: "$120,000 - $140,000" },
    interaction: "text",
  },

  // ── US State of residence ─────────────────────────────────────────────
  {
    name: "us_state_residence",
    pattern: /which\s*(us\s*)?state|state.*reside|state.*live|current\s*state/i,
    answer: { kind: "dataKey", path: "candidate.state", fallback: "Texas" },
    interaction: "text",
  },

  // ── Open to hybrid / remote+office ────────────────────────────────────
  {
    name: "open_to_hybrid",
    pattern: /open\s*to.*hybrid|remote.*hybrid|flexible.*hybrid|hybrid.*working/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── Open to occasional travel / in-person ─────────────────────────────
  {
    name: "open_to_travel",
    pattern: /open\s*to.*travel|occasional\s*travel|in-person\s*collaborat/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── Work authorization (US) — explicit pattern for "legally authorized" ──
  {
    name: "work_authorized_us",
    pattern: /legally\s*work\s*authorized|authorized\s*to\s*work\s*in\s*the\s*us|work\s*authorized.*us|legal.*work.*us/i,
    answer: { kind: "dataKey", path: "candidate.authorizedToWork", fallback: "Yes" },
    interaction: "react-select",
  },

  // ── EEO / voluntary self-identification ──────────────────────────────
  // Search seeds are intentionally omitted so fillReactSelect uses the
  // first 3 chars of the resolved value.  Custom EEO dropdowns (Robinhood
  // etc.) have options like "Cisgender man" not "Male", so hardcoded
  // seeds like "Male" filter to zero results.
  {
    name: "eeo_gender_identity",
    pattern: /gender\s*identity|describe.*gender/i,
    answer: { kind: "dataKey", path: "candidate.gender", fallback: "Male" },
    interaction: "react-select",
  },
  {
    name: "eeo_race_ethnicity",
    pattern: /race.*ethnicity|ethnicity.*race|racial.*background|ethnic.*background|describe.*racial/i,
    answer: { kind: "dataKey", path: "candidate.raceEthnicity", fallback: "Asian" },
    interaction: "react-select",
  },
  {
    name: "eeo_military_status",
    pattern: /military\s*status|armed\s*forces|served.*military/i,
    answer: { kind: "dataKey", path: "candidate.veteranStatus", fallback: "I have never served in the military" },
    interaction: "react-select",
    searchSeed: "",
  },
  {
    name: "eeo_disability_status",
    pattern: /disability\s*status|do\s*you\s*have.*disability|substantially\s*limits/i,
    answer: { kind: "dataKey", path: "candidate.disabilityStatus", fallback: "No, I don't have a disability" },
    interaction: "react-select",
    searchSeed: "",
  },
  {
    name: "eeo_lgbtq",
    pattern: /lgbtq|identify\s*as\s*part\s*of\s*the\s*lgbtq/i,
    answer: { kind: "literal", value: "I don't wish to answer" },
    interaction: "react-select",
    searchSeed: "wish",
  },
  {
    name: "eeo_hispanic_latino",
    pattern: /hispanic.*latino|latino.*hispanic/i,
    answer: { kind: "dataKey", path: "candidate.hispanicLatino", fallback: "No" },
    interaction: "react-select",
  },

  // ── Government official / conflict of interest ────────────────────────
  {
    name: "government_official",
    pattern: /government\s*official|bribery|corruption.*risk|public\s*function/i,
    answer: { kind: "literal", value: "No" },
    interaction: "react-select",
  },

  // ── Personal relationships / conflicts of interest ────────────────────
  {
    name: "personal_relationships_conflicts",
    pattern: /personal.*familial\s*relationship|outside\s*business\s*activit|intellectual\s*property\s*ownership/i,
    answer: { kind: "literal", value: "No" },
    interaction: "react-select",
  },

  // ── Currently using product ───────────────────────────────────────────
  {
    name: "used_product",
    pattern: /have\s*you\s*used\s+\w+\b(?!\s*robinhood.*employee|.*worked)/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

];

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

function normalize(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").replace(/[*:?]+$/, "").trim();
}

function resolveDataKey(
  data: Record<string, unknown>,
  dotPath: string,
): string | undefined {
  const parts = dotPath.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Match a question label against the deterministic rule table.
 *
 * Returns the resolved answer value on match, or a no_match signal with the
 * original label so the caller can log / escalate.
 */
export function matchScreeningQuestion(
  label: string,
  data: Record<string, unknown>,
  rules: readonly ScreeningRule[] = SCREENING_RULES,
): RuleMatchOutcome {
  const norm = normalize(label);

  for (const rule of rules) {
    if (rule.pattern.test(norm)) {
      let value: string;
      if (rule.answer.kind === "literal") {
        value = rule.answer.value;
      } else {
        value = resolveDataKey(data, rule.answer.path) ?? rule.answer.fallback ?? "";
      }
      return { matched: true, rule, value };
    }
  }

  return { matched: false, label };
}
