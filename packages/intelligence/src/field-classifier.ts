import type { FieldMapping } from "@dejsol/core";
import type {
  ModelProvider,
  IntelligenceCache,
  DeterministicCheck,
} from "./types.js";
import { matchFieldLabel, matchFieldMapping } from "./pattern-matcher.js";

// ─── Input / output shapes ────────────────────────────────────────────────

export interface FieldClassifierInput {
  label: string;
  selector: string;
  inputType: string;
  placeholder?: string;
  options?: string[];
  surroundingText?: string;
}

export interface ClassifiedField {
  normalizedKey: string;
  candidatePath: string;
  confidence: number;
  source: "pattern_matcher" | "portal_fingerprint" | "model";
}

// ─── Deterministic precheck ───────────────────────────────────────────────

/**
 * Attempt to classify a field deterministically before any model call.
 *
 * Checks in order:
 * 1. Existing portal field mappings (reuse learned mappings)
 * 2. Pattern matcher synonym table
 *
 * Returns `{ hit: true, value }` when a deterministic match is found.
 */
export function precheckFieldClassification(
  input: FieldClassifierInput,
  existingMappings?: Record<string, FieldMapping>,
): DeterministicCheck<ClassifiedField> {
  if (existingMappings) {
    const portalMatch = matchFieldMapping(input.label, existingMappings);
    if (portalMatch) {
      return {
        hit: true,
        value: {
          normalizedKey: portalMatch.value.normalizedKey,
          candidatePath: portalMatch.value.normalizedKey,
          confidence: portalMatch.confidence,
          source: "portal_fingerprint",
        },
        source: "portal_fingerprint",
      };
    }
  }

  const signalText = [input.label, input.placeholder].filter(Boolean).join(" ");
  const patternMatch = matchFieldLabel(signalText);
  if (patternMatch) {
    return {
      hit: true,
      value: {
        normalizedKey: patternMatch.value,
        candidatePath: patternMatch.value,
        confidence: patternMatch.confidence,
        source: "pattern_matcher",
      },
      source: "pattern_matcher",
    };
  }

  return { hit: false };
}

// ─── Service interface ────────────────────────────────────────────────────

export interface FieldClassifierService {
  classify(
    input: FieldClassifierInput,
    existingMappings?: Record<string, FieldMapping>,
  ): Promise<ClassifiedField | null>;
}

// ─── Default implementation ───────────────────────────────────────────────

/**
 * Create a field classifier that checks deterministic patterns first,
 * then falls back to a model provider if available.
 */
export function createFieldClassifier(
  provider?: ModelProvider,
  cache?: IntelligenceCache,
): FieldClassifierService {
  return {
    async classify(
      input: FieldClassifierInput,
      existingMappings?: Record<string, FieldMapping>,
    ): Promise<ClassifiedField | null> {
      const precheck = precheckFieldClassification(input, existingMappings);
      if (precheck.hit && precheck.value) {
        return precheck.value;
      }

      if (!provider) return null;

      const cacheKey = `field_classify:${input.label}:${input.inputType}`;
      if (cache) {
        const cached = await cache.get<ClassifiedField>(cacheKey);
        if (cached) return cached;
      }

      const result = await provider.complete<{
        normalizedKey: string;
        candidatePath: string;
        confidence: number;
      }>({
        systemPrompt:
          "You are a form field classifier. Given a field label, type, and context, " +
          "identify the normalized key and candidate data path. Respond with JSON only.",
        userPrompt: JSON.stringify(input),
        maxOutputTokens: 200,
        temperature: 0,
      });

      const classified: ClassifiedField = {
        normalizedKey: result.value.normalizedKey,
        candidatePath: result.value.candidatePath,
        confidence: result.value.confidence,
        source: "model",
      };

      if (cache) {
        await cache.set(cacheKey, classified);
      }

      return classified;
    },
  };
}
