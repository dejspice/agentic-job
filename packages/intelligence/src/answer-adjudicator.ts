/**
 * Answer Adjudicator — LLM-based evaluation of screening answer quality.
 *
 * Generates a recommendation for each NEW/risky answer. The recommendation
 * is advisory only — the policy layer (adjudication-policy.ts) makes the
 * final promotion decision.
 *
 * The LLM sees: question, answer, source, candidate context, company,
 * visible options (for dropdowns), and must return a structured assessment.
 */

import type { ModelProvider, LlmResult } from "./types.js";

export interface AdjudicationInput {
  question: string;
  answer: string;
  source: string;
  confidence: number;
  fieldType: string;
  visibleOptions?: string[];
  candidateName?: string;
  candidateCity?: string;
  candidateState?: string;
  company?: string;
  jobTitle?: string;
  runOutcome?: string;
}

export interface AdjudicationOutput {
  appropriatenessScore: number;
  riskLevel: "low" | "medium" | "high";
  questionClass: "identity" | "eligibility" | "preference" | "referral" | "compliance" | "narrative" | "other";
  recommendation: "auto_promote_to_answer_bank" | "candidate_bank_only" | "human_review_required" | "reject" | "rule_candidate";
  reason: string;
}

const SYSTEM_PROMPT = `You are an answer quality evaluator for an automated job application system.

You are given a screening question, the answer that was submitted, context about the candidate and job, and the visible dropdown options if it was a dropdown field.

Evaluate whether the answer is appropriate and safe to persist for future reuse.

Rules:
- Score appropriateness from 0.0 to 1.0 (1.0 = perfect, contextually correct answer)
- Classify question into one of: identity, eligibility, preference, referral, compliance, narrative, other
- Assess risk level:
  - "low": grounded in profile data, simple factual, non-sensitive
  - "medium": preference-based, contextual, could vary
  - "high": legal/compliance, salary, freeform claims, sensitive identity
- Recommend one of:
  - "auto_promote_to_answer_bank": safe for automatic reuse across applications
  - "candidate_bank_only": useful for this candidate but not generalizable
  - "human_review_required": needs operator verification before reuse
  - "reject": answer appears wrong, inappropriate, or contradictory
  - "rule_candidate": low-risk, stable, could become a deterministic rule
- For dropdown/combobox fields: check if the selected answer exists in visibleOptions and is semantically appropriate
- If visibleOptions are provided and the answer is NOT in the list, that is a red flag
- Keep reason to 1-2 sentences

Respond with JSON only: { "appropriatenessScore": number, "riskLevel": string, "questionClass": string, "recommendation": string, "reason": string }`;

export interface AnswerAdjudicatorService {
  adjudicate(input: AdjudicationInput): Promise<AdjudicationOutput>;
  adjudicateBatch(inputs: AdjudicationInput[]): Promise<AdjudicationOutput[]>;
}

/**
 * Create an adjudicator backed by an LLM provider.
 */
export function createAnswerAdjudicator(provider: ModelProvider): AnswerAdjudicatorService {
  async function adjudicateOne(input: AdjudicationInput): Promise<AdjudicationOutput> {
    const userPayload: Record<string, unknown> = {
      question: input.question,
      answer: input.answer,
      source: input.source,
      confidence: input.confidence,
      fieldType: input.fieldType,
    };
    if (input.visibleOptions) userPayload.visibleOptions = input.visibleOptions;
    if (input.candidateName) userPayload.candidateName = input.candidateName;
    if (input.candidateCity) userPayload.candidateLocation = `${input.candidateCity}, ${input.candidateState ?? ""}`.trim();
    if (input.company) userPayload.company = input.company;
    if (input.jobTitle) userPayload.jobTitle = input.jobTitle;
    if (input.runOutcome) userPayload.runOutcome = input.runOutcome;

    const result: LlmResult<AdjudicationOutput> = await provider.complete<AdjudicationOutput>({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify(userPayload),
      maxOutputTokens: 200,
      temperature: 0.1,
    });

    return {
      appropriatenessScore: Math.max(0, Math.min(1, result.value.appropriatenessScore ?? 0.5)),
      riskLevel: (["low", "medium", "high"].includes(result.value.riskLevel) ? result.value.riskLevel : "medium") as AdjudicationOutput["riskLevel"],
      questionClass: result.value.questionClass ?? "other",
      recommendation: result.value.recommendation ?? "human_review_required",
      reason: result.value.reason ?? "No reason provided",
    };
  }

  return {
    adjudicate: adjudicateOne,
    async adjudicateBatch(inputs: AdjudicationInput[]): Promise<AdjudicationOutput[]> {
      const results: AdjudicationOutput[] = [];
      for (const input of inputs) {
        try {
          results.push(await adjudicateOne(input));
        } catch {
          results.push({
            appropriatenessScore: 0.5,
            riskLevel: "high",
            questionClass: "other",
            recommendation: "human_review_required",
            reason: "Adjudication failed — defaulting to human review",
          });
        }
      }
      return results;
    },
  };
}

/**
 * Create a no-op adjudicator that always returns human_review_required.
 * Used when no LLM provider is available.
 */
export function createNoOpAdjudicator(): AnswerAdjudicatorService {
  const fallback: AdjudicationOutput = {
    appropriatenessScore: 0.5,
    riskLevel: "medium",
    questionClass: "other",
    recommendation: "human_review_required",
    reason: "No adjudication provider — defaulting to human review",
  };
  return {
    async adjudicate(): Promise<AdjudicationOutput> { return fallback; },
    async adjudicateBatch(inputs: AdjudicationInput[]): Promise<AdjudicationOutput[]> {
      return inputs.map(() => fallback);
    },
  };
}
