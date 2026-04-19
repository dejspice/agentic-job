/**
 * Adjudicate screening answers produced by a run.
 *
 * Extracted from the greenhouse-live-harness so the same logic can run inside
 * the Temporal activity path (runGreenhouseHappyPathActivity). This function
 * is NOT a Temporal activity itself — it is intended to be invoked from
 * within an activity's Node.js runtime (where network access + secrets are
 * available). The workflow code never calls it directly.
 *
 * Responsibilities
 *   1. For each risky-source answer (source = "llm" | "combobox_fallback"),
 *      call createAnswerAdjudicator(...).adjudicateBatch(...).
 *   2. Pass each LLM result through applyPolicy(...) to produce a final
 *      promotion decision.
 *   3. Decorate each ScreeningAnswerEntry with an `adjudication` block.
 *
 * Mutates entries in place inside the provided array. Answers whose source
 * is already deterministic (rule / answer_bank / prefilled) are left alone.
 *
 * Never throws — adjudication failures are swallowed and logged, matching
 * the harness behaviour.
 */

import {
  createAnswerAdjudicator,
  createNoOpAdjudicator,
  createClaudeProvider,
  applyPolicy,
} from "@dejsol/intelligence";
import type { AdjudicationInput } from "@dejsol/intelligence";
import type { ScreeningAnswerEntry } from "@dejsol/state-machine";

export interface AdjudicateScreeningAnswersInput {
  screeningAnswers: ScreeningAnswerEntry[] | undefined;
  candidate?: Record<string, unknown>;
  company?: string;
  jobTitle?: string;
  runOutcome?: string;
  /** Optional override for API key lookup. Defaults to process.env.ANTHROPIC_API_KEY. */
  anthropicKey?: string;
}

export interface AdjudicateScreeningAnswersResult {
  screeningAnswers: ScreeningAnswerEntry[];
  answerReviewRequired: boolean;
  answerReviewCount: number;
}

const RISKY_SOURCES: ReadonlySet<string> = new Set(["llm", "combobox_fallback"]);
const REVIEW_RECOMMENDATIONS: ReadonlySet<string> = new Set([
  "human_review_required",
  "reject",
]);

/**
 * Adjudicate the risky entries in `screeningAnswers` and decorate each one
 * with `adjudication`. Returns the (possibly same) array plus review metrics.
 */
export async function adjudicateScreeningAnswers(
  input: AdjudicateScreeningAnswersInput,
): Promise<AdjudicateScreeningAnswersResult> {
  const entries = input.screeningAnswers ?? [];
  if (entries.length === 0) {
    return { screeningAnswers: entries, answerReviewRequired: false, answerReviewCount: 0 };
  }

  const riskyIndices: number[] = [];
  const riskyEntries: ScreeningAnswerEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e && RISKY_SOURCES.has(e.source)) {
      riskyIndices.push(i);
      riskyEntries.push(e);
    }
  }

  if (riskyEntries.length > 0) {
    const anthropicKey = (input.anthropicKey ?? process.env["ANTHROPIC_API_KEY"] ?? "").trim();
    const adjudicator = anthropicKey
      ? createAnswerAdjudicator(createClaudeProvider(anthropicKey))
      : createNoOpAdjudicator();

    const candidateBag = input.candidate as Record<string, string> | undefined;
    const candidateName = candidateBag
      ? `${candidateBag["firstName"] ?? ""} ${candidateBag["lastName"] ?? ""}`.trim() || undefined
      : undefined;

    const adjInputs: AdjudicationInput[] = riskyEntries.map(a => ({
      question: a.question,
      answer: a.answer,
      source: a.source,
      confidence: a.confidence,
      fieldType: a.fieldType,
      visibleOptions: a.visibleOptions,
      candidateName,
      candidateCity: candidateBag?.["city"],
      candidateState: candidateBag?.["state"],
      company: input.company,
      jobTitle: input.jobTitle,
      runOutcome: input.runOutcome,
    }));

    try {
      const adjResults = await adjudicator.adjudicateBatch(adjInputs);
      for (let i = 0; i < riskyEntries.length; i++) {
        const llmRec = adjResults[i];
        const risky = riskyEntries[i];
        if (!llmRec || !risky) continue;
        const policyResult = applyPolicy({
          question: risky.question,
          answer: risky.answer,
          source: risky.source,
          confidence: risky.confidence,
          fieldType: risky.fieldType,
          visibleOptions: risky.visibleOptions,
          llmRecommendation: llmRec,
        });
        const riskLevel = policyResult.decision === "reject" ? "high"
          : policyResult.decision === "human_review_required" ? "high"
          : policyResult.decision === "candidate_bank_only" ? "medium"
          : "low";
        // Decorate the entry in place so the caller's array reference reflects
        // the adjudication outcome.
        const targetIdx = riskyIndices[i];
        if (typeof targetIdx === "number" && entries[targetIdx]) {
          entries[targetIdx]!.adjudication = {
            appropriatenessScore: llmRec.appropriatenessScore,
            riskLevel,
            recommendation: policyResult.decision,
            reason: policyResult.reason,
          };
        }
      }
    } catch (err) {
      // Never fail the run because adjudication failed — log and move on,
      // leaving the entries undecorated (same as the harness).
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[adjudicate-screening-answers] Error: ${msg}`);
    }
  }

  let answerReviewCount = 0;
  for (const e of entries) {
    if (e?.adjudication && REVIEW_RECOMMENDATIONS.has(e.adjudication.recommendation)) {
      answerReviewCount += 1;
    }
  }

  return {
    screeningAnswers: entries,
    answerReviewRequired: answerReviewCount > 0,
    answerReviewCount,
  };
}

/**
 * Pure helper: given a (possibly) adjudicated array of screening answers,
 * return the review metrics.
 *
 * Used by read endpoints that receive persisted screeningAnswers from
 * apply_runs.answersJson and need to expose derived booleans to clients.
 */
export function computeAnswerReviewMetrics(
  screeningAnswers: Array<{ adjudication?: { recommendation?: string } }> | undefined,
): { answerReviewRequired: boolean; answerReviewCount: number } {
  if (!Array.isArray(screeningAnswers) || screeningAnswers.length === 0) {
    return { answerReviewRequired: false, answerReviewCount: 0 };
  }
  let answerReviewCount = 0;
  for (const e of screeningAnswers) {
    const rec = e?.adjudication?.recommendation;
    if (rec && REVIEW_RECOMMENDATIONS.has(rec)) answerReviewCount += 1;
  }
  return { answerReviewRequired: answerReviewCount > 0, answerReviewCount };
}
