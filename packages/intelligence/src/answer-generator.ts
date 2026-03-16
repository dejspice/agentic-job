import type { AnswerBank, CandidateProfile } from "@dejsol/core";
import type {
  ModelProvider,
  IntelligenceCache,
  DeterministicCheck,
} from "./types.js";
import { matchAnswerBank } from "./pattern-matcher.js";

// ─── Input / output shapes ────────────────────────────────────────────────

export interface AnswerRequest {
  question: string;
  fieldType: "text" | "select" | "radio" | "checkbox" | "textarea";
  options?: string[];
  jobTitle?: string;
  company?: string;
  maxLength?: number;
}

export interface GeneratedAnswer {
  answer: string;
  confidence: number;
  source: "answer_bank" | "profile" | "model";
  cacheKey?: string;
}

// ─── Deterministic precheck ───────────────────────────────────────────────

/**
 * Attempt to answer a screening question deterministically before any model call.
 *
 * Checks in order:
 * 1. Answer bank (exact / normalized / fuzzy matching)
 * 2. Candidate profile for common factual questions
 *
 * Returns `{ hit: true, value }` when a deterministic answer is found.
 */
export function precheckAnswer(
  request: AnswerRequest,
  answerBank: AnswerBank,
  profile?: CandidateProfile,
): DeterministicCheck<GeneratedAnswer> {
  const bankMatch = matchAnswerBank(request.question, answerBank);
  if (bankMatch && bankMatch.confidence >= 0.75) {
    return {
      hit: true,
      value: {
        answer: bankMatch.value.answer,
        confidence: bankMatch.confidence,
        source: "answer_bank",
      },
      source: "answer_bank",
    };
  }

  if (profile) {
    const profileAnswer = matchFromProfile(request, profile);
    if (profileAnswer) {
      return {
        hit: true,
        value: profileAnswer,
        source: "profile",
      };
    }
  }

  return { hit: false };
}

// ─── Profile-based factual matching ───────────────────────────────────────

const PROFILE_QUESTIONS: Array<{
  pattern: RegExp;
  extract: (profile: CandidateProfile) => string | undefined;
}> = [
  {
    pattern: /years?\s*(?:of\s*)?experience/i,
    extract: (p) =>
      p.yearsOfExperience != null ? String(p.yearsOfExperience) : undefined,
  },
  {
    pattern: /linkedin/i,
    extract: (p) => p.links?.["linkedin"],
  },
  {
    pattern: /website|portfolio/i,
    extract: (p) => p.links?.["website"] ?? p.links?.["portfolio"],
  },
  {
    pattern: /github/i,
    extract: (p) => p.links?.["github"],
  },
];

function matchFromProfile(
  request: AnswerRequest,
  profile: CandidateProfile,
): GeneratedAnswer | null {
  for (const pq of PROFILE_QUESTIONS) {
    if (pq.pattern.test(request.question)) {
      const value = pq.extract(profile);
      if (value) {
        return {
          answer: value,
          confidence: 0.9,
          source: "profile",
        };
      }
    }
  }
  return null;
}

// ─── Service interface ────────────────────────────────────────────────────

export interface AnswerGeneratorService {
  generate(
    request: AnswerRequest,
    answerBank: AnswerBank,
    profile?: CandidateProfile,
  ): Promise<GeneratedAnswer | null>;
}

// ─── Default implementation ───────────────────────────────────────────────

/**
 * Create an answer generator that checks deterministic sources first,
 * then falls back to a model provider if available.
 */
export function createAnswerGenerator(
  provider?: ModelProvider,
  cache?: IntelligenceCache,
): AnswerGeneratorService {
  return {
    async generate(
      request: AnswerRequest,
      answerBank: AnswerBank,
      profile?: CandidateProfile,
    ): Promise<GeneratedAnswer | null> {
      const precheck = precheckAnswer(request, answerBank, profile);
      if (precheck.hit && precheck.value) {
        return precheck.value;
      }

      if (!provider) return null;

      const cacheKey = `answer:${request.question}:${request.jobTitle ?? ""}`;
      if (cache) {
        const cached = await cache.get<GeneratedAnswer>(cacheKey);
        if (cached) return cached;
      }

      const result = await provider.complete<{ answer: string; confidence: number }>({
        systemPrompt:
          "You are a job application assistant. Generate a concise, professional answer " +
          "for the given screening question. Respond with JSON: { answer, confidence }.",
        userPrompt: JSON.stringify({
          question: request.question,
          fieldType: request.fieldType,
          options: request.options,
          jobTitle: request.jobTitle,
          company: request.company,
          maxLength: request.maxLength,
          candidateProfile: profile,
        }),
        maxOutputTokens: 500,
        temperature: 0.3,
      });

      const generated: GeneratedAnswer = {
        answer: result.value.answer,
        confidence: result.value.confidence,
        source: "model",
        cacheKey,
      };

      if (cache) {
        await cache.set(cacheKey, generated);
      }

      return generated;
    },
  };
}
