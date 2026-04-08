/**
 * Adjudication Policy — enforces promotion rules above the LLM recommendation.
 *
 * The LLM adjudicator recommends; this module decides. The policy is the
 * final authority on whether an answer is auto-promoted, banked for the
 * candidate, sent to human review, rejected, or flagged as a rule candidate.
 *
 * Deterministic, no LLM calls. Pure function of the answer + LLM output.
 */

import type { AdjudicationOutput } from "./answer-adjudicator.js";

export type PolicyDecision =
  | "auto_promote_to_answer_bank"
  | "candidate_bank_only"
  | "human_review_required"
  | "reject"
  | "rule_candidate";

export interface PolicyInput {
  question: string;
  answer: string;
  source: string;
  confidence: number;
  fieldType: string;
  visibleOptions?: string[];
  llmRecommendation: AdjudicationOutput;
}

export interface PolicyOutput {
  decision: PolicyDecision;
  reason: string;
  llmAgreed: boolean;
}

// ---------------------------------------------------------------------------
// High-risk question patterns (always human review)
// ---------------------------------------------------------------------------

const HIGH_RISK_PATTERNS: RegExp[] = [
  /salary|compensation|pay\s*expectation|desired\s*pay|monthly\s*salary/i,
  /criminal|conviction|felony|misdemeanor|arrest/i,
  /disability|substantially\s*limits/i,
  /veteran|military\s*service|armed\s*forces/i,
  /gender\s*identity|sexual\s*orientation|lgbtq/i,
  /race.*ethnicity|ethnicity.*race|racial/i,
  /hispanic.*latino/i,
  /relocat/i,
];

const MEDIUM_RISK_PATTERNS: RegExp[] = [
  /pronoun/i,
  /why\s+(this|are\s+you|do\s+you\s+want)|what\s+(draws|excites|interests)\s+you/i,
  /describe\s+(a\s+time|your|how)/i,
  /what\s+type\s+of\s+work/i,
  /experience\s+with|experience\s+in/i,
];

const LOW_RISK_IDENTITY: RegExp[] = [
  /^preferred\s*name$|^first\s*name$|^last\s*name$|^legal\s*(first|last)\s*name$/i,
  /^city$|^state$|^country$|^zip/i,
  /^phone|^email|^address/i,
  /^linkedin/i,
  /^website/i,
];

// ---------------------------------------------------------------------------
// Policy enforcement
// ---------------------------------------------------------------------------

function isHighRisk(question: string): boolean {
  return HIGH_RISK_PATTERNS.some(p => p.test(question));
}

function isMediumRisk(question: string): boolean {
  return MEDIUM_RISK_PATTERNS.some(p => p.test(question));
}

function isLowRiskIdentity(question: string): boolean {
  return LOW_RISK_IDENTITY.some(p => p.test(question));
}

/**
 * Apply promotion policy to an adjudicated answer.
 *
 * Policy overrides the LLM recommendation when necessary:
 * - High-risk questions → always human_review_required
 * - Low confidence → never auto-promoted
 * - Dropdown answer not in visible options → reject or human review
 * - Safe source (rule/prefilled) → no adjudication needed (passthrough)
 */
export function applyPolicy(input: PolicyInput): PolicyOutput {
  const { question, answer, source, confidence, visibleOptions, llmRecommendation } = input;
  const llmRec = llmRecommendation.recommendation;

  if (source === "rule" || source === "prefilled") {
    return { decision: "auto_promote_to_answer_bank", reason: "Deterministic source — safe", llmAgreed: true };
  }

  if (source === "answer_bank") {
    return { decision: "auto_promote_to_answer_bank", reason: "Previously approved bank entry", llmAgreed: true };
  }

  if (visibleOptions && visibleOptions.length > 0) {
    const normalized = visibleOptions.map(o => o.toLowerCase().trim());
    if (!normalized.includes(answer.toLowerCase().trim())) {
      const partial = normalized.some(o => o.includes(answer.toLowerCase().trim()) || answer.toLowerCase().trim().includes(o));
      if (!partial) {
        return { decision: "reject", reason: `Selected "${answer}" is not in visible options`, llmAgreed: llmRec === "reject" };
      }
    }
  }

  if (isHighRisk(question)) {
    const decision: PolicyDecision = "human_review_required";
    return { decision, reason: "High-risk question class — policy requires human review", llmAgreed: llmRec === decision };
  }

  // Combobox fallback carve-out: combobox_fallback hardcodes confidence 0.5,
  // but when the LLM adjudicator confirms the answer is appropriate (≥ 0.95)
  // and the answer exists in the visible options, trust the LLM assessment.
  if (source === "combobox_fallback" && llmRecommendation.appropriatenessScore >= 0.95
      && visibleOptions && visibleOptions.length > 0) {
    const normalized = visibleOptions.map(o => o.toLowerCase().trim());
    const answerInOptions = normalized.some(o => o.includes(answer.toLowerCase().trim()) || answer.toLowerCase().trim().includes(o));
    if (answerInOptions) {
      const decision: PolicyDecision = llmRecommendation.riskLevel === "low" ? "auto_promote_to_answer_bank" : "candidate_bank_only";
      return { decision, reason: `Combobox fallback verified by adjudicator (${Math.round(llmRecommendation.appropriatenessScore * 100)}%) — answer in options`, llmAgreed: llmRec === decision };
    }
  }

  if (confidence < 0.8) {
    return { decision: "human_review_required", reason: `Low confidence (${Math.round(confidence * 100)}%) — policy requires human review`, llmAgreed: llmRec === "human_review_required" };
  }

  if (llmRec === "reject") {
    return { decision: "reject", reason: llmRecommendation.reason, llmAgreed: true };
  }

  if (isMediumRisk(question)) {
    const allowed: PolicyDecision[] = ["candidate_bank_only", "human_review_required"];
    const decision = allowed.includes(llmRec as PolicyDecision) ? llmRec as PolicyDecision : "candidate_bank_only";
    return { decision, reason: "Medium-risk question — capped to candidate bank", llmAgreed: llmRec === decision };
  }

  if (isLowRiskIdentity(question) && confidence >= 0.95 && llmRecommendation.appropriatenessScore >= 0.9) {
    const decision: PolicyDecision = llmRec === "rule_candidate" ? "rule_candidate" : "auto_promote_to_answer_bank";
    return { decision, reason: "Low-risk identity field, high confidence", llmAgreed: llmRec === decision };
  }

  if (confidence >= 0.95 && llmRecommendation.appropriatenessScore >= 0.9 && llmRecommendation.riskLevel === "low") {
    const decision = llmRec === "rule_candidate" ? "rule_candidate"
      : llmRec === "auto_promote_to_answer_bank" ? "auto_promote_to_answer_bank"
      : "candidate_bank_only";
    return { decision, reason: "High confidence + low LLM risk — eligible for promotion", llmAgreed: llmRec === decision };
  }

  if (confidence >= 0.8) {
    return { decision: "candidate_bank_only", reason: "Moderate confidence — candidate bank only", llmAgreed: llmRec === "candidate_bank_only" };
  }

  return { decision: "human_review_required", reason: "Default — human review required", llmAgreed: llmRec === "human_review_required" };
}
