/**
 * Shared types for the intelligence package.
 * Every LLM-capable module tracks cost and supports caching.
 */

// ─── LLM call tracking ───────────────────────────────────────────────────

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  cached: boolean;
}

/**
 * Wrapper for any LLM-backed result. The `usage` field is always present
 * so callers can accumulate cost in RunCost.
 */
export interface LlmResult<T> {
  value: T;
  usage: LlmUsage;
}

// ─── Model provider abstraction ──────────────────────────────────────────

export const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export interface ModelProvider {
  /**
   * Send a structured prompt to the model and receive a typed response.
   * Implementations handle serialization, retries, and token counting.
   */
  complete<T>(request: ModelRequest): Promise<LlmResult<T>>;
}

export interface ModelRequest {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

// ─── Cache abstraction ────────────────────────────────────────────────────

export interface IntelligenceCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
}

// ─── Deterministic precheck result ────────────────────────────────────────

/**
 * Returned by deterministic precheck methods. If `hit` is true, the
 * deterministic result should be used and no LLM call is needed.
 */
export interface DeterministicCheck<T> {
  hit: boolean;
  value?: T;
  source?: string;
}
