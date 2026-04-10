/**
 * Tests for adjudication-policy.ts — deterministic policy layer.
 *
 * Covers:
 *   1. Safe sources (rule, prefilled, answer_bank) bypass adjudication
 *   2. High-risk questions always require human review
 *   3. Combobox fallback carve-out: safe yes/no → auto-promote
 *   4. Combobox fallback carve-out: high-risk still requires review
 *   5. Combobox fallback carve-out: medium-risk excluded
 *   6. Combobox fallback carve-out: answer NOT in options → no carve-out
 *   7. Combobox fallback carve-out: low adjudicator score → no carve-out
 *   8. Low confidence LLM → human review
 *   9. Medium-risk → capped to candidate_bank_only
 *  10. High confidence + low LLM risk → eligible for promotion
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyPolicy } from "../adjudication-policy.js";
import type { PolicyInput } from "../adjudication-policy.js";
import type { AdjudicationOutput } from "../answer-adjudicator.js";

function makeInput(overrides: Partial<PolicyInput> & { llmRecommendation: AdjudicationOutput }): PolicyInput {
  return {
    question: "Test question?",
    answer: "Yes",
    source: "llm",
    confidence: 0.8,
    fieldType: "text",
    ...overrides,
  };
}

function makeLlm(overrides: Partial<AdjudicationOutput> = {}): AdjudicationOutput {
  return {
    appropriatenessScore: 0.9,
    riskLevel: "low",
    questionClass: "eligibility",
    recommendation: "auto_promote_to_answer_bank",
    reason: "Test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Safe sources bypass
// ---------------------------------------------------------------------------

describe("safe sources bypass adjudication", () => {
  it("rule source → auto_promote", () => {
    const result = applyPolicy(makeInput({ source: "rule", llmRecommendation: makeLlm() }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });

  it("prefilled source → auto_promote", () => {
    const result = applyPolicy(makeInput({ source: "prefilled", llmRecommendation: makeLlm() }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });

  it("answer_bank source → auto_promote", () => {
    const result = applyPolicy(makeInput({ source: "answer_bank", llmRecommendation: makeLlm() }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });
});

// ---------------------------------------------------------------------------
// 2. High-risk always requires review
// ---------------------------------------------------------------------------

describe("high-risk questions always require human review", () => {
  for (const q of [
    "What are your salary expectations?",
    "Do you have any criminal convictions?",
    "What is your disability status?",
    "Are you willing to relocate?",
  ]) {
    it(`"${q.substring(0, 40)}..." → human_review_required`, () => {
      const result = applyPolicy(makeInput({
        question: q,
        source: "combobox_fallback",
        confidence: 0.5,
        visibleOptions: ["Yes", "No"],
        llmRecommendation: makeLlm({ appropriatenessScore: 1.0 }),
      }));
      assert.equal(result.decision, "human_review_required");
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Combobox fallback carve-out: safe yes/no → auto-promote
// ---------------------------------------------------------------------------

describe("combobox fallback carve-out — safe answers auto-promote", () => {
  it("'Are you over 18?' → 'Yes' with score 1.0 and visible options → auto_promote", () => {
    const result = applyPolicy(makeInput({
      question: "Are you over 18 years of age?",
      answer: "Yes",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Yes", "No"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });

  it("'Are you able to work in the US?' → 'Yes' → auto_promote", () => {
    const result = applyPolicy(makeInput({
      question: "Are you able to work in the United States?",
      answer: "Yes",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Yes", "No"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });

  it("privacy notice acknowledgment with long option label → auto_promote", () => {
    const result = applyPolicy(makeInput({
      question: "Job Applicant Privacy Notice",
      answer: "I Acknowledge this Privacy Notice",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["I Acknowledge this Privacy Notice"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });

  it("medium LLM risk → candidate_bank_only instead of auto_promote", () => {
    const result = applyPolicy(makeInput({
      question: "Are you comfortable with on-call schedules?",
      answer: "Yes",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Yes", "No"],
      llmRecommendation: makeLlm({ appropriatenessScore: 0.95, riskLevel: "medium" }),
    }));
    assert.equal(result.decision, "candidate_bank_only");
  });
});

// ---------------------------------------------------------------------------
// 4. High-risk dropdown still requires review despite carve-out
// ---------------------------------------------------------------------------

describe("combobox fallback carve-out — high-risk still gated", () => {
  it("salary dropdown → still human_review_required", () => {
    const result = applyPolicy(makeInput({
      question: "What is your desired salary range?",
      answer: "$100k-$120k",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["$80k-$100k", "$100k-$120k", "$120k+"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "human_review_required");
  });

  it("relocation dropdown → still human_review_required", () => {
    const result = applyPolicy(makeInput({
      question: "Are you willing to relocate to our office?",
      answer: "Yes",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Yes", "No"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "human_review_required");
  });
});

// ---------------------------------------------------------------------------
// 5. Medium-risk excluded from carve-out
// ---------------------------------------------------------------------------

describe("combobox fallback carve-out — medium-risk excluded", () => {
  it("pronouns dropdown → falls through to confidence gate → human_review", () => {
    const result = applyPolicy(makeInput({
      question: "Pronouns",
      answer: "He/Him",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["He/Him", "She/Her", "They/Them"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "human_review_required");
  });
});

// ---------------------------------------------------------------------------
// 6. Answer NOT in visible options → no carve-out
// ---------------------------------------------------------------------------

describe("combobox fallback carve-out — answer not in options", () => {
  it("answer missing from options → reject (answer not in visible options)", () => {
    const result = applyPolicy(makeInput({
      question: "Select your team preference",
      answer: "Engineering",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Sales", "Marketing", "Operations"],
      llmRecommendation: makeLlm({ appropriatenessScore: 0.95, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "reject");
  });

  it("no visibleOptions → falls through to confidence gate → human_review", () => {
    const result = applyPolicy(makeInput({
      question: "Select your team preference",
      answer: "Engineering",
      source: "combobox_fallback",
      confidence: 0.5,
      llmRecommendation: makeLlm({ appropriatenessScore: 0.95, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "human_review_required");
  });
});

// ---------------------------------------------------------------------------
// 7. Low adjudicator score → no carve-out
// ---------------------------------------------------------------------------

describe("combobox fallback carve-out — low adjudicator score", () => {
  it("appropriateness 0.7 → falls through to confidence gate", () => {
    const result = applyPolicy(makeInput({
      question: "Are you available full-time?",
      answer: "Yes",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Yes", "No"],
      llmRecommendation: makeLlm({ appropriatenessScore: 0.7, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "human_review_required");
  });
});

// ---------------------------------------------------------------------------
// 8–10. Existing policy behavior preserved
// ---------------------------------------------------------------------------

describe("existing policy behavior preserved", () => {
  it("LLM source with confidence 0.5 → human_review_required", () => {
    const result = applyPolicy(makeInput({
      source: "llm",
      confidence: 0.5,
      llmRecommendation: makeLlm({ appropriatenessScore: 0.9 }),
    }));
    assert.equal(result.decision, "human_review_required");
  });

  it("LLM source with confidence 0.85 + medium risk question → candidate_bank_only", () => {
    const result = applyPolicy(makeInput({
      question: "Describe a time you led a project",
      source: "llm",
      confidence: 0.85,
      llmRecommendation: makeLlm({ appropriatenessScore: 0.9 }),
    }));
    assert.equal(result.decision, "candidate_bank_only");
  });

  it("LLM source with confidence 0.95 + low risk → eligible for promotion", () => {
    const result = applyPolicy(makeInput({
      question: "Are you currently employed?",
      source: "llm",
      confidence: 0.95,
      llmRecommendation: makeLlm({ appropriatenessScore: 0.9, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });

  it("answer not in visible options → reject", () => {
    const result = applyPolicy(makeInput({
      answer: "Purple",
      visibleOptions: ["Red", "Blue", "Green"],
      llmRecommendation: makeLlm(),
    }));
    assert.equal(result.decision, "reject");
  });
});

// ---------------------------------------------------------------------------
// Employer-history / worked-here-before — grounding guard
// ---------------------------------------------------------------------------

describe("employer-history questions are medium-risk", () => {
  it("'Previously been an employee of X' combobox → human_review (medium-risk blocks carve-out, low confidence blocks fallback)", () => {
    const result = applyPolicy(makeInput({
      question: "Have you previously been an employee of NetDocuments?",
      answer: "Yes",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Yes", "No"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "human_review_required");
  });

  it("'Ever worked for X' combobox → human_review (same reason)", () => {
    const result = applyPolicy(makeInput({
      question: "Have you ever worked for Acme Corp?",
      answer: "No",
      source: "combobox_fallback",
      confidence: 0.5,
      visibleOptions: ["Yes", "No"],
      llmRecommendation: makeLlm({ appropriatenessScore: 1.0, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "human_review_required");
  });

  it("'Former employee' LLM with high confidence → capped to candidate_bank_only (medium-risk)", () => {
    const result = applyPolicy(makeInput({
      question: "Are you a former employee of this company?",
      answer: "No",
      source: "llm",
      confidence: 0.95,
      llmRecommendation: makeLlm({ appropriatenessScore: 0.95, riskLevel: "low" }),
    }));
    assert.equal(result.decision, "candidate_bank_only");
  });

  it("'Worked here before' with rule source → still auto-promotes (deterministic)", () => {
    const result = applyPolicy(makeInput({
      question: "Have you worked here before?",
      source: "rule",
      confidence: 1.0,
      llmRecommendation: makeLlm(),
    }));
    assert.equal(result.decision, "auto_promote_to_answer_bank");
  });
});
