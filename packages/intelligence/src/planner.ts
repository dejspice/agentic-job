import type { StateName } from "@dejsol/core";
import type {
  ModelProvider,
  IntelligenceCache,
  DeterministicCheck,
} from "./types.js";

// ─── Input / output shapes ────────────────────────────────────────────────

export interface PlannerInput {
  currentState: StateName;
  pageUrl: string;
  pageTitle: string;
  availableActions: string[];
  recentHistory: Array<{ state: StateName; outcome: string }>;
  domSummary?: string;
  screenshotDescription?: string;
}

export interface PlannedStep {
  action: string;
  target?: string;
  confidence: number;
  reasoning: string;
  source: "deterministic" | "model";
}

// ─── Deterministic precheck ───────────────────────────────────────────────

const ACTION_PRIORITY: Record<string, string[]> = {
  DETECT_APPLY_ENTRY: ["apply", "apply now", "start application"],
  LOGIN_OR_CONTINUE: ["continue without account", "skip", "continue as guest", "continue"],
  UPLOAD_RESUME: ["upload", "attach", "choose file", "browse"],
  FILL_REQUIRED_FIELDS: ["next", "continue", "save and continue"],
  ANSWER_SCREENING_QUESTIONS: ["next", "continue", "save and continue"],
  REVIEW_DISCLOSURES: ["next", "continue", "accept", "acknowledge"],
  PRE_SUBMIT_CHECK: ["review", "preview", "next"],
  SUBMIT: ["submit", "submit application", "send application", "complete"],
};

/**
 * Attempt to determine the next action deterministically based on
 * the current state and available actions.
 */
export function precheckPlanner(
  input: PlannerInput,
): DeterministicCheck<PlannedStep> {
  const priorityActions = ACTION_PRIORITY[input.currentState];
  if (!priorityActions) return { hit: false };

  const actionsLower = input.availableActions.map((a) => a.toLowerCase().trim());

  for (const expected of priorityActions) {
    const idx = actionsLower.findIndex(
      (a) => a === expected || a.includes(expected),
    );
    if (idx >= 0) {
      return {
        hit: true,
        value: {
          action: "CLICK",
          target: input.availableActions[idx],
          confidence: 0.85,
          reasoning: `State ${input.currentState}: matched expected action "${expected}"`,
          source: "deterministic",
        },
        source: "deterministic",
      };
    }
  }

  return { hit: false };
}

// ─── Service interface ────────────────────────────────────────────────────

export interface PlannerService {
  plan(input: PlannerInput): Promise<PlannedStep>;
}

// ─── Default implementation ───────────────────────────────────────────────

/**
 * Create a planner that uses deterministic state-based action matching first,
 * then falls back to a model provider for ambiguous flows.
 *
 * The planner is a fallback layer, not the main orchestration engine.
 * The state machine drives the flow; the planner only activates when
 * the state machine cannot determine the next action.
 */
export function createPlanner(
  provider?: ModelProvider,
  cache?: IntelligenceCache,
): PlannerService {
  return {
    async plan(input: PlannerInput): Promise<PlannedStep> {
      const precheck = precheckPlanner(input);
      if (precheck.hit && precheck.value) {
        return precheck.value;
      }

      if (!provider) {
        return {
          action: "SCREENSHOT",
          confidence: 0.2,
          reasoning: "No deterministic match and no model available; capturing state for review",
          source: "deterministic",
        };
      }

      const cacheKey = `plan:${input.currentState}:${input.pageUrl}`;
      if (cache) {
        const cached = await cache.get<PlannedStep>(cacheKey);
        if (cached) return cached;
      }

      const result = await provider.complete<{
        action: string;
        target?: string;
        confidence: number;
        reasoning: string;
      }>({
        systemPrompt:
          "You are a job application flow planner. Given the current state, page context, " +
          "and available actions, determine the best next step. " +
          "Respond with JSON: { action, target?, confidence, reasoning }. " +
          "Actions follow the WorkerCommand types: NAVIGATE, CLICK, TYPE, SCREENSHOT, etc.",
        userPrompt: JSON.stringify(input),
        maxOutputTokens: 300,
        temperature: 0,
      });

      const planned: PlannedStep = {
        ...result.value,
        source: "model",
      };

      if (cache) {
        await cache.set(cacheKey, planned);
      }

      return planned;
    },
  };
}
