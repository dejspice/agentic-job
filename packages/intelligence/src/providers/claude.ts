/**
 * Minimal Claude (Anthropic Messages API) provider implementing ModelProvider.
 *
 * Uses native fetch — no SDK dependency. Handles JSON extraction from the
 * response, token counting from the API response, and structured output.
 *
 * Usage:
 *   const provider = createClaudeProvider(process.env.ANTHROPIC_API_KEY);
 *   const result = await provider.complete<{ answer: string }>({ ... });
 */

import type { ModelProvider, ModelRequest, LlmResult } from "../types.js";
import { DEFAULT_MODEL } from "../types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
}

export function createClaudeProvider(apiKey: string): ModelProvider {
  return {
    async complete<T>(request: ModelRequest): Promise<LlmResult<T>> {
      const model = request.model ?? DEFAULT_MODEL;
      const start = performance.now();

      const messages: AnthropicMessage[] = [
        { role: "user", content: request.userPrompt },
      ];

      const body = {
        model,
        max_tokens: request.maxOutputTokens ?? 500,
        temperature: request.temperature ?? 0.3,
        system: request.systemPrompt,
        messages,
      };

      // Abort the request if it takes longer than 20 seconds.
      // This prevents individual LLM calls from hanging a full run.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      let response: Response;
      try {
        response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "unknown error");
        throw new Error(`Claude API error ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      const latencyMs = Math.round(performance.now() - start);

      const rawText = data.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");

      let parsed: T;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText) as T;
      } catch {
        parsed = { answer: rawText, confidence: 0.7 } as unknown as T;
      }

      return {
        value: parsed,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          latencyMs,
          model: data.model,
          cached: false,
        },
      };
    },
  };
}
