import type {
  CandidateProfile,
  JobOpportunity,
} from "@dejsol/core";
import type {
  ModelProvider,
  IntelligenceCache,
  DeterministicCheck,
} from "./types.js";

// ─── Input / output shapes ────────────────────────────────────────────────

export interface FitAnalysisInput {
  profile: CandidateProfile;
  job: Pick<JobOpportunity, "jobTitle" | "company" | "location" | "requirementsJson">;
}

export interface FitAnalysisResult {
  fitScore: number;
  applyabilityScore: number;
  confidenceScore: number;
  reasons: string[];
  source: "deterministic" | "model";
}

// ─── Deterministic precheck ───────────────────────────────────────────────

/**
 * Compute a rough fit score deterministically by comparing profile data
 * against job requirements. No LLM needed for basic checks.
 */
export function precheckFitAnalysis(
  input: FitAnalysisInput,
): DeterministicCheck<FitAnalysisResult> {
  const { profile, job } = input;
  const req = job.requirementsJson;

  if (!req) {
    return { hit: false };
  }

  const signals: string[] = [];
  let score = 0.5;
  let dataPoints = 0;

  if (req.yearsOfExperience != null && profile.yearsOfExperience != null) {
    dataPoints++;
    if (profile.yearsOfExperience >= req.yearsOfExperience) {
      score += 0.15;
      signals.push(`Experience: ${profile.yearsOfExperience}y ≥ ${req.yearsOfExperience}y required`);
    } else {
      score -= 0.1;
      signals.push(`Experience: ${profile.yearsOfExperience}y < ${req.yearsOfExperience}y required`);
    }
  }

  if (req.skills && req.skills.length > 0 && profile.skills && profile.skills.length > 0) {
    dataPoints++;
    const profileSkillsLower = new Set(profile.skills.map((s) => s.toLowerCase()));
    let matched = 0;
    for (const skill of req.skills) {
      if (profileSkillsLower.has(skill.toLowerCase())) matched++;
    }
    const skillRatio = matched / req.skills.length;
    score += (skillRatio - 0.5) * 0.3;
    signals.push(`Skills: ${matched}/${req.skills.length} matched`);
  }

  if (req.education && profile.education && profile.education.length > 0) {
    dataPoints++;
    const educationLower = req.education.toLowerCase();
    const hasMatch = profile.education.some(
      (e) =>
        e.degree.toLowerCase().includes(educationLower) ||
        educationLower.includes(e.degree.toLowerCase()),
    );
    if (hasMatch) {
      score += 0.1;
      signals.push(`Education: requirement "${req.education}" matched`);
    } else {
      signals.push(`Education: requirement "${req.education}" not clearly matched`);
    }
  }

  if (dataPoints < 2) {
    return { hit: false };
  }

  const fitScore = Math.max(0, Math.min(1, score));

  return {
    hit: true,
    value: {
      fitScore,
      applyabilityScore: fitScore > 0.4 ? 0.8 : 0.4,
      confidenceScore: Math.min(0.7, dataPoints * 0.2),
      reasons: signals,
      source: "deterministic",
    },
    source: "deterministic",
  };
}

// ─── Service interface ────────────────────────────────────────────────────

export interface FitAnalyzerService {
  analyze(input: FitAnalysisInput): Promise<FitAnalysisResult>;
}

// ─── Default implementation ───────────────────────────────────────────────

/**
 * Create a fit analyzer that uses deterministic scoring first,
 * then falls back to a model provider for richer analysis.
 */
export function createFitAnalyzer(
  provider?: ModelProvider,
  cache?: IntelligenceCache,
): FitAnalyzerService {
  return {
    async analyze(input: FitAnalysisInput): Promise<FitAnalysisResult> {
      const precheck = precheckFitAnalysis(input);
      if (precheck.hit && precheck.value) {
        return precheck.value;
      }

      if (!provider) {
        return {
          fitScore: 0.5,
          applyabilityScore: 0.5,
          confidenceScore: 0.1,
          reasons: ["Insufficient data for deterministic scoring; no model available"],
          source: "deterministic",
        };
      }

      const cacheKey = `fit:${input.job.jobTitle}:${input.job.company}`;
      if (cache) {
        const cached = await cache.get<FitAnalysisResult>(cacheKey);
        if (cached) return cached;
      }

      const result = await provider.complete<{
        fitScore: number;
        applyabilityScore: number;
        confidenceScore: number;
        reasons: string[];
      }>({
        systemPrompt:
          "You are a job fit analyzer. Given a candidate profile and job requirements, " +
          "produce a fit analysis. Respond with JSON: { fitScore, applyabilityScore, confidenceScore, reasons }. " +
          "Scores are 0–1.",
        userPrompt: JSON.stringify({
          profile: input.profile,
          job: input.job,
        }),
        maxOutputTokens: 500,
        temperature: 0,
      });

      const analysis: FitAnalysisResult = {
        ...result.value,
        source: "model",
      };

      if (cache) {
        await cache.set(cacheKey, analysis);
      }

      return analysis;
    },
  };
}
