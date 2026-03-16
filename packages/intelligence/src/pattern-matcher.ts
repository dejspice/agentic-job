import type { AnswerBank, AnswerBankEntry, FieldMapping } from "@dejsol/core";

// ─── Match result ─────────────────────────────────────────────────────────

export interface PatternMatch<T> {
  value: T;
  confidence: number;
  matchType: "exact" | "normalized" | "fuzzy";
}

// ─── Text normalization ───────────────────────────────────────────────────

/**
 * Normalize text for comparison: lowercase, collapse whitespace,
 * strip punctuation and leading/trailing whitespace.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Exact matching ───────────────────────────────────────────────────────

/**
 * Exact match after normalization.
 */
export function exactMatch(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

// ─── Token-overlap similarity ─────────────────────────────────────────────

/**
 * Compute Jaccard similarity over word tokens.
 * Returns 0–1 where 1 is identical token sets.
 */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalize(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/**
 * Check whether `a` contains all significant tokens of `b` (or vice-versa).
 * Useful for substring-style matching on questions.
 */
export function containsAllTokens(haystack: string, needle: string): boolean {
  const hTokens = new Set(normalize(haystack).split(" ").filter(Boolean));
  const nTokens = normalize(needle).split(" ").filter(Boolean);
  if (nTokens.length === 0) return false;
  return nTokens.every((t) => hTokens.has(t));
}

// ─── Answer bank lookup ───────────────────────────────────────────────────

/**
 * Search the answer bank for a matching question using deterministic matching.
 *
 * Priority:
 * 1. Exact normalized match (confidence 1.0)
 * 2. Token containment match (confidence 0.85)
 * 3. High token similarity (≥ threshold, default 0.75) (confidence = similarity)
 *
 * Returns null if no match reaches the threshold.
 */
export function matchAnswerBank(
  question: string,
  answerBank: AnswerBank,
  similarityThreshold = 0.75,
): PatternMatch<AnswerBankEntry> | null {
  const entries = Object.values(answerBank);
  if (entries.length === 0) return null;

  const normalizedQ = normalize(question);

  for (const entry of entries) {
    if (normalize(entry.question) === normalizedQ) {
      return { value: entry, confidence: 1.0, matchType: "exact" };
    }
  }

  for (const entry of entries) {
    if (
      containsAllTokens(entry.question, question) ||
      containsAllTokens(question, entry.question)
    ) {
      return { value: entry, confidence: 0.85, matchType: "normalized" };
    }
  }

  let bestEntry: AnswerBankEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    const score = tokenSimilarity(question, entry.question);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (bestEntry && bestScore >= similarityThreshold) {
    return { value: bestEntry, confidence: bestScore, matchType: "fuzzy" };
  }

  return null;
}

// ─── Field label matching ─────────────────────────────────────────────────

/**
 * Common field label synonyms grouped by normalized key.
 * Used for deterministic field classification before any LLM fallback.
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  first_name: ["first name", "given name", "forename"],
  last_name: ["last name", "surname", "family name"],
  full_name: ["full name", "name", "your name", "applicant name"],
  email: ["email", "email address", "e-mail", "e mail"],
  phone: ["phone", "phone number", "telephone", "mobile", "cell", "contact number"],
  resume: ["resume", "cv", "curriculum vitae", "resume cv"],
  cover_letter: ["cover letter", "covering letter"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin profile"],
  website_url: ["website", "personal website", "portfolio", "personal url"],
  github_url: ["github", "github url", "github profile"],
  address: ["address", "street address", "mailing address"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  country: ["country", "nation"],
  postal_code: ["zip", "zip code", "postal code", "postcode"],
  salary_expectation: ["salary", "desired salary", "salary expectation", "compensation", "desired pay"],
  start_date: ["start date", "availability", "available start date", "earliest start"],
  years_experience: ["years of experience", "years experience", "total experience"],
  education: ["education", "highest education", "degree", "highest degree"],
  work_authorization: ["work authorization", "authorized to work", "legally authorized", "right to work"],
  sponsorship_required: ["sponsorship", "visa sponsorship", "require sponsorship"],
  gender: ["gender", "sex"],
  race: ["race", "ethnicity", "race ethnicity"],
  veteran_status: ["veteran", "veteran status", "military service"],
  disability_status: ["disability", "disability status"],
};

/**
 * Match a field label to a normalized key using deterministic synonym lookup.
 * Returns null if no synonym matches above the threshold.
 */
export function matchFieldLabel(
  label: string,
  similarityThreshold = 0.75,
): PatternMatch<string> | null {
  const normalizedLabel = normalize(label);

  for (const [key, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (normalizedLabel === synonym) {
        return { value: key, confidence: 1.0, matchType: "exact" };
      }
    }
  }

  for (const [key, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (normalizedLabel.includes(synonym) || synonym.includes(normalizedLabel)) {
        return { value: key, confidence: 0.85, matchType: "normalized" };
      }
    }
  }

  let bestKey: string | null = null;
  let bestScore = 0;

  for (const [key, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (const synonym of synonyms) {
      const score = tokenSimilarity(label, synonym);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
  }

  if (bestKey && bestScore >= similarityThreshold) {
    return { value: bestKey, confidence: bestScore, matchType: "fuzzy" };
  }

  return null;
}

/**
 * Match a field label against existing portal field mappings.
 * Used to reuse previously learned mappings before attempting fresh classification.
 */
export function matchFieldMapping(
  label: string,
  mappings: Record<string, FieldMapping>,
): PatternMatch<FieldMapping> | null {
  const normalizedLabel = normalize(label);

  for (const mapping of Object.values(mappings)) {
    if (normalize(mapping.portalFieldLabel) === normalizedLabel) {
      return { value: mapping, confidence: mapping.confidence, matchType: "exact" };
    }
  }

  let bestMapping: FieldMapping | null = null;
  let bestScore = 0;

  for (const mapping of Object.values(mappings)) {
    const score = tokenSimilarity(label, mapping.portalFieldLabel);
    if (score > bestScore) {
      bestScore = score;
      bestMapping = mapping;
    }
  }

  if (bestMapping && bestScore >= 0.75) {
    return {
      value: bestMapping,
      confidence: Math.min(bestMapping.confidence, bestScore),
      matchType: "fuzzy",
    };
  }

  return null;
}
