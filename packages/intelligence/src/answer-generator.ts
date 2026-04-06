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
          "You are a job application assistant filling out screening questions on an ATS form.\n\n" +
          "Rules:\n" +
          "- ALWAYS provide a plausible, professional answer. NEVER say 'Unable to answer', 'I cannot', 'N/A', or refuse to answer.\n" +
          "- Write concise, professional answers (2-4 sentences for text fields, 1 sentence for short fields)\n" +
          "- Be specific and relevant to the role and company\n" +
          "- Draw on the candidate profile provided — do not invent credentials\n" +
          "- For yes/no questions, answer directly then briefly explain\n" +
          "- For experience questions, reference real skills from the profile\n" +
          "- For 'why this company/role' questions, connect the candidate's background to the role\n" +
          "- For 'how did you hear' follow-up questions, say 'Job board' or 'Online search'\n" +
          "- If you lack context, give a reasonable positive answer rather than declining\n" +
          "- Never exceed 500 characters unless explicitly told otherwise\n" +
          "- Respond with JSON: { \"answer\": \"<your answer>\", \"confidence\": 0.0-1.0 }",
        userPrompt: JSON.stringify({
          question: request.question,
          fieldType: request.fieldType,
          options: request.options,
          jobTitle: request.jobTitle,
          company: request.company,
          maxLength: request.maxLength ?? 500,
          candidateProfile: profile,
        }),
        maxOutputTokens: 300,
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
