import type { StateName, ErrorLogEntry } from "@dejsol/core";
import type {
  ModelProvider,
  IntelligenceCache,
  DeterministicCheck,
} from "./types.js";

// ─── Input / output shapes ────────────────────────────────────────────────

export interface RecoveryInput {
  currentState: StateName;
  error: ErrorLogEntry;
  recentHistory: Array<{ state: StateName; outcome: string }>;
  pageUrl?: string;
  pageTitle?: string;
}

export type RecoveryAction =
  | "retry"
  | "retry_with_delay"
  | "skip_state"
  | "go_back"
  | "refresh_page"
  | "escalate";

export interface RecoverySuggestion {
  action: RecoveryAction;
  confidence: number;
  reasoning: string;
  source: "deterministic" | "model";
}

// ─── Deterministic precheck ───────────────────────────────────────────────

const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /network/i,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /navigation/i,
  /frame was detached/i,
  /target closed/i,
  /execution context/i,
];

const NON_RECOVERABLE_PATTERNS = [
  /job.*(no longer|not).*(available|found)/i,
  /position.*(filled|closed)/i,
  /account.*required/i,
  /captcha/i,
];

/**
 * Diagnose a failure deterministically and suggest a recovery action.
 * Handles common transient errors (timeouts, network) and known terminal errors.
 */
export function precheckRecovery(
  input: RecoveryInput,
): DeterministicCheck<RecoverySuggestion> {
  const { error, recentHistory } = input;
  const msg = error.message;

  for (const pattern of NON_RECOVERABLE_PATTERNS) {
    if (pattern.test(msg)) {
      return {
        hit: true,
        value: {
          action: "escalate",
          confidence: 0.9,
          reasoning: `Non-recoverable error detected: ${msg}`,
          source: "deterministic",
        },
        source: "deterministic",
      };
    }
  }

  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (pattern.test(msg)) {
      const recentRetries = recentHistory.filter(
        (h) => h.state === input.currentState && h.outcome === "failure",
      ).length;

      if (recentRetries >= 3) {
        return {
          hit: true,
          value: {
            action: "escalate",
            confidence: 0.85,
            reasoning: `Transient error "${msg}" but already retried ${recentRetries} times`,
            source: "deterministic",
          },
          source: "deterministic",
        };
      }

      return {
        hit: true,
        value: {
          action: recentRetries >= 1 ? "retry_with_delay" : "retry",
          confidence: 0.8,
          reasoning: `Transient error detected: ${msg} (retry ${recentRetries + 1})`,
          source: "deterministic",
        },
        source: "deterministic",
      };
    }
  }

  if (!error.recoverable) {
    return {
      hit: true,
      value: {
        action: "escalate",
        confidence: 0.7,
        reasoning: `Error marked non-recoverable: ${msg}`,
        source: "deterministic",
      },
      source: "deterministic",
    };
  }

  return { hit: false };
}

// ─── Service interface ────────────────────────────────────────────────────

export interface ErrorRecoveryService {
  diagnose(input: RecoveryInput): Promise<RecoverySuggestion>;
}

// ─── Default implementation ───────────────────────────────────────────────

/**
 * Create an error recovery service that uses deterministic diagnosis first,
 * then falls back to a model provider for ambiguous failures.
 */
export function createErrorRecovery(
  provider?: ModelProvider,
  cache?: IntelligenceCache,
): ErrorRecoveryService {
  return {
    async diagnose(input: RecoveryInput): Promise<RecoverySuggestion> {
      const precheck = precheckRecovery(input);
      if (precheck.hit && precheck.value) {
        return precheck.value;
      }

      if (!provider) {
        return {
          action: error_recoverable(input) ? "retry" : "escalate",
          confidence: 0.4,
          reasoning: "No deterministic match and no model available; defaulting",
          source: "deterministic",
        };
      }

      const result = await provider.complete<{
        action: RecoveryAction;
        confidence: number;
        reasoning: string;
      }>({
        systemPrompt:
          "You are a browser automation error recovery specialist. " +
          "Given an error in a job application flow, suggest the best recovery action. " +
          "Respond with JSON: { action, confidence, reasoning }. " +
          "Actions: retry, retry_with_delay, skip_state, go_back, refresh_page, escalate.",
        userPrompt: JSON.stringify(input),
        maxOutputTokens: 300,
        temperature: 0,
      });

      return {
        ...result.value,
        source: "model",
      };
    },
  };
}

function error_recoverable(input: RecoveryInput): boolean {
  return input.error.recoverable;
}
