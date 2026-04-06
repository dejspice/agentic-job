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
  // ── Personal-info duplicates (screening-section variants) ────────────
  // Some boards (SmithRx) repeat name/address fields as screening questions.
  {
    name: "legal_first_name",
    pattern: /^legal\s*first\s*name$|^first\s*name$/i,
    answer: { kind: "dataKey", path: "candidate.firstName" },
    interaction: "text",
  },
  {
    name: "legal_last_name",
    pattern: /^legal\s*last\s*name$|^last\s*name$/i,
    answer: { kind: "dataKey", path: "candidate.lastName" },
    interaction: "text",
  },
  {
    name: "address_type",
    pattern: /^address\s*type$/i,
    answer: { kind: "literal", value: "Home" },
    interaction: "react-select",
    searchSeed: "Home",
  },
  {
    name: "address_line",
    pattern: /^address\s*(line)?\s*1$|^street\s*address$/i,
    answer: { kind: "dataKey", path: "candidate.address", fallback: "123 Main St" },
    interaction: "text",
  },
  {
    name: "city_field",
    pattern: /^city$/i,
    answer: { kind: "dataKey", path: "candidate.city", fallback: "Austin" },
    interaction: "text",
  },
  {
    name: "state_field",
    pattern: /^state$/i,
    answer: { kind: "dataKey", path: "candidate.state", fallback: "Texas" },
    interaction: "react-select",
    searchSeed: "Tex",
  },
  {
    name: "country_field",
    pattern: /^country$/i,
    answer: { kind: "dataKey", path: "candidate.country", fallback: "United States" },
    interaction: "react-select",
    searchSeed: "US",
  },
  {
    name: "zip_code",
    pattern: /zip\s*code|postal\s*code/i,
    answer: { kind: "dataKey", path: "candidate.zipCode", fallback: "78701" },
    interaction: "text",
  },

  // ── Location (freeform / dropdown: "Where are you located?") ────────
  {
    name: "location_where",
    pattern: /where\s*(are\s*you|do\s*you)\s*(located|live|reside)|your\s*location|current\s*location|primary\s*location/i,
    answer: { kind: "dataKey", path: "candidate.location", fallback: "Dallas, TX" },
    interaction: "react-select",
    searchSeed: "dataKey:candidate.city",
  },

  // ── LinkedIn ──────────────────────────────────────────────────────────
  {
    name: "linkedin_profile",
    pattern: /linkedin/i,
    answer: { kind: "dataKey", path: "candidate.linkedin", fallback: "N/A" },
    interaction: "text",
  },

  // ── Website / portfolio URL ─────────────────────────────────────────
  {
    name: "website_field",
    pattern: /^website$|^personal\s*website$/i,
    answer: { kind: "dataKey", path: "candidate.website", fallback: "N/A" },
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

  // ── Follow-up: "If you selected 'Other' please indicate the source" ──
  {
    name: "referral_source_other",
    pattern: /indicate\s*the\s*source|please\s*specify.*source|if\s*you\s*selected.*other|other.*please\s*specify|specify.*referral|indicate.*how.*heard/i,
    answer: { kind: "literal", value: "Job board" },
    interaction: "text",
  },

  // ── Willing to relocate ───────────────────────────────────────────────
  {
    name: "willing_to_relocate",
    pattern: /willing\s*to\s*relocate|open\s*to\s*relocation/i,
    answer: { kind: "dataKey", path: "candidate.willingToRelocate", fallback: "Yes" },
    interaction: "react-select",
  },

  // ── Salary expectation (monthly — must come before annual catch-all) ──
  {
    name: "salary_expectation_monthly",
    pattern: /monthly\s*salary|salary.*monthly|monthly.*compensation|monthly.*pay/i,
    answer: { kind: "dataKey", path: "candidate.monthlySalaryRange", fallback: "$10,000 - $12,000" },
    interaction: "text",
  },

  // ── Salary expectation (annual) ────────────────────────────────────────
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
  // Only match short "have you used <product>?" yes/no questions.
  // Exclude long freeform questions that ask "what ... have you used"
  // (e.g. "What AI tools have you used to help enhance the work you do?")
  {
    name: "used_product",
    pattern: /^have\s*you\s*used\s+\w+\b(?!\s*robinhood.*employee|.*worked)/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── Education level ──────────────────────────────────────────────────
  {
    name: "education_level",
    pattern: /highest.*level.*education|education.*completed|degree|highest.*degree/i,
    answer: { kind: "dataKey", path: "candidate.education", fallback: "Bachelor's degree in Computer Science" },
    interaction: "text",
  },

  // ── System architecture expertise ────────────────────────────────────
  {
    name: "system_architecture_expertise",
    pattern: /expertise\s*in\s*system\s*architecture|system\s*architecture.*scalability|design\s*for\s*scalability.*reliability/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── Dependent freeform: "describe your ML work" ────────────────────
  // Must come BEFORE the generic ML experience rule — "describe your work
  // with Machine Learning" is a freeform textarea, not a Yes/No combobox.
  {
    name: "describe_ml_work",
    pattern: /describe\s*your\s*work\s*with\s*machine\s*learning|describe.*machine\s*learning.*production|please\s*describe.*machine\s*learning/i,
    answer: { kind: "dataKey", path: "candidate.mlExperience", fallback: "I have applied machine learning models for predictive analytics, feature engineering, and data pipeline optimization in production SaaS environments." },
    interaction: "text",
  },

  // ── Machine Learning experience ────────────────────────────────────
  {
    name: "machine_learning_experience",
    pattern: /experience\s*with\s*machine\s*learning|machine\s*learning\s*concepts/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── Generic "do you have experience with/in X" ─────────────────────
  // Catches patterns like "Do you have experience deploying...",
  // "Do you have experience with Kubernetes?", etc.
  // Uses "text" interaction so it works for both text inputs and
  // textareas. Combobox variants that don't match this rule are handled
  // by the unmatched-dropdown fallback (which also defaults to "Yes").
  {
    name: "have_experience_with",
    pattern: /^do\s*you\s*have\s*(any\s*)?experience\s*(with|deploying|in|building|working|managing|using|creating|designing)/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "text",
  },

  // ── Privacy / data consent acknowledgment ───────────────────────────
  {
    name: "privacy_consent",
    pattern: /consent.*collection|consent.*personal\s*data|privacy\s*policy|data.*privacy.*consent|i\s*consent/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── "Please confirm you understand" / acknowledgments ──────────────
  {
    name: "confirm_acknowledge",
    pattern: /please\s*confirm\s*you\s*understand|confirm\s*that\s*you|acknowledge\s*that|do\s*you\s*agree\s*to|i\s*understand/i,
    answer: { kind: "literal", value: "Yes" },
    interaction: "react-select",
  },

  // ── Company-specific enrollment / membership / graduate ─────────────
  // Questions like "Are you enrolled in X program?", "Are you a member
  // of our network?" — should default to "No" not "Yes".
  {
    name: "company_program_enrollment",
    pattern: /currently\s*enrolled|are\s*you\s*(a\s*)?member\s*of\s*our|graduate\s*of\s*(a\s*)?.*program|are\s*you\s*(a\s*)?.*alumni/i,
    answer: { kind: "literal", value: "No" },
    interaction: "react-select",
  },

  // ── "What type of work does <company> do" ───────────────────────────
  // Company-knowledge dropdown; fall back to a safe generic answer.
  {
    name: "company_work_type",
    pattern: /what\s*(type|kind)\s*of\s*work\s*does/i,
    answer: { kind: "literal", value: "Technology" },
    interaction: "react-select",
    searchSeed: "Tech",
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
