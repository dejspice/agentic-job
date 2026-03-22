/**
 * Deterministic dropdown option matcher.
 *
 * Given a desired answer string and a list of visible option labels,
 * picks the best matching option using layered deterministic scoring:
 *
 *   1. Exact match (case-insensitive, whitespace-collapsed)
 *   2. Alias match (table-driven synonyms expand the desired value)
 *   3. Starts-with / contains match
 *   4. Token overlap (word-level Jaccard-like scoring)
 *
 * No LLM logic — purely string-based deterministic ranking.
 */

// ---------------------------------------------------------------------------
// Alias table — maps a normalized answer value to alternate forms that
// should also count as a match.  Keyed by lowercase collapsed string.
// ---------------------------------------------------------------------------

const ANSWER_ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  // ── Duration / experience buckets ────────────────────────────────────
  ["3-5 years",       ["3 to 5 years", "3–5 years", "3 - 5 years", "3-5"]],
  ["1-2 years",       ["1 to 2 years", "1–2 years", "1 - 2 years", "1-2"]],
  ["5-10 years",      ["5 to 10 years", "5–10 years", "5 - 10 years"]],
  ["5+ years",        ["5 to 10 years", "5-10 years", "5–10 years",
                       "5 or more years", "more than 5 years",
                       "10 or more years", "10+ years"]],
  ["10+ years",       ["10 or more years", "more than 10 years", "10 plus years", "over 10 years"]],
  ["less than 1 year",["under 1 year", "< 1 year", "0-1 years", "0 to 1 year"]],

  // ── Yes / No variants ────────────────────────────────────────────────
  ["yes",             ["yes, i do", "yes, i have", "yes, i am", "yes, i can", "yes, i will"]],
  ["no",              ["no, i do not", "no, i don't", "no, i have not", "no, i haven't",
                       "no, i am not", "no, i'm not", "no, i will not", "no, i won't"]],

  // ── Industry categories ──────────────────────────────────────────────
  ["technology",      ["tech", "software", "information technology", "it",
                       "saas", "internet", "software / saas", "technology / software"]],
  ["saas / software", ["saas", "software", "technology / software", "technology",
                       "b2b saas", "b2b (enterprise software, saas)", "software / saas"]],
  ["finance",         ["financial services", "banking", "fintech", "financial technology",
                       "financial services / fintech"]],
  ["healthcare",      ["health", "health care", "medical", "biotech", "life sciences",
                       "healthcare / life sciences"]],
  ["e-commerce",      ["ecommerce", "retail", "online retail", "retail / e-commerce",
                       "consumer / b2c (e-commerce, media, mobile apps)"]],

  // ── Analytics scope — real Celigo Greenhouse labels ──────────────────
  ["company-wide",    ["company wide", "enterprise", "organization-wide", "org-wide",
                       "across the company", "entire company", "company-level"]],
  ["defining kpis and building analytics frameworks",
                      ["building analytics frameworks", "defining kpis",
                       "kpis and analytics", "analytics frameworks"]],
  ["team-level",      ["team level", "team", "within a team", "single team"]],
  ["department-level",["department level", "department", "within a department"]],

  // ── Python/R proficiency — real Celigo Greenhouse labels ─────────────
  ["i use python or r regularly for data analysis",
                      ["python or r regularly", "use python or r",
                       "regularly for data analysis"]],
  ["advanced",        ["advanced / expert", "expert", "highly proficient",
                       "very experienced", "advanced/expert"]],
  ["intermediate",    ["intermediate / proficient", "proficient", "moderate",
                       "intermediate/proficient"]],
  ["beginner",        ["beginner / learning", "basic", "novice", "learning",
                       "beginner/learning"]],
]);

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")   // en-dash / em-dash → hyphen
    .replace(/['']/g, "'")              // smart quotes
    .replace(/\s+/g, " ")
    .replace(/[*:?]+$/, "")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(/[\s/,;]+/)
      .filter((t) => t.length > 1),
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface OptionCandidate {
  /** 0-based index in the options list (used for clicking by nth). */
  index: number;
  /** Raw label text from the DOM. */
  label: string;
  /** Deterministic match score — higher is better. */
  score: number;
}

/**
 * Score a single option label against the desired answer.
 *
 * Scoring tiers:
 *   100 — exact normalized match
 *    90 — alias match (desired value's alias matches the option exactly)
 *    80 — option starts with the desired value
 *    70 — desired value found as substring in option
 *    60 — option found as substring in desired value
 *   0-50 — token overlap (Jaccard-like)
 */
export function scoreOption(desired: string, optionLabel: string): number {
  const d = norm(desired);
  const o = norm(optionLabel);

  if (d === o) return 100;

  // Alias expansion
  const aliases = ANSWER_ALIASES.get(d);
  if (aliases) {
    for (const alias of aliases) {
      if (norm(alias) === o) return 90;
    }
  }

  if (o.startsWith(d)) return 80;
  if (o.includes(d)) return 70;
  if (d.includes(o) && o.length > 2) return 60;

  // Token overlap
  const dTokens = tokens(desired);
  const oTokens = tokens(optionLabel);
  if (dTokens.size === 0 || oTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of dTokens) {
    if (oTokens.has(t)) overlap++;
  }
  const jaccard = overlap / (dTokens.size + oTokens.size - overlap);
  return Math.round(jaccard * 50);
}

/**
 * Pick the best matching option from a list of visible option labels.
 *
 * Returns the winning OptionCandidate, or null if no option scores
 * above the minimum threshold (default 25).
 */
export function pickBestOption(
  desired: string,
  optionLabels: string[],
  minScore = 25,
): OptionCandidate | null {
  let best: OptionCandidate | null = null;

  for (let i = 0; i < optionLabels.length; i++) {
    const label = optionLabels[i]!;
    const score = scoreOption(desired, label);
    if (score >= minScore && (best === null || score > best.score)) {
      best = { index: i, label, score };
    }
  }

  return best;
}
