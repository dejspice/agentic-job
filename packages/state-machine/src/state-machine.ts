import { StateName, STATE_ORDER, TERMINAL_STATES } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "./types.js";
import { stateHandlers } from "./states/index.js";

/**
 * Core orchestrator for the apply workflow state machine.
 *
 * Responsibilities:
 * - Registers all 14 state handlers in canonical order.
 * - Resolves the next state given a current state and its execution result.
 * - Provides lookup, ordering, and terminal-state queries.
 *
 * This scaffold does NOT yet implement:
 * - Policy engine integration (retry, timeout, escalation policies)
 * - Validation watcher hooks
 * - Real workflow execution loop (that lives in packages/workflows)
 */
export class ApplyStateMachine {
  private readonly handlers: ReadonlyMap<StateName, StateHandler>;
  private readonly order: readonly StateName[];

  constructor() {
    this.order = STATE_ORDER;

    const handlerMap = new Map<StateName, StateHandler>();
    for (const handler of stateHandlers) {
      if (handlerMap.has(handler.name)) {
        throw new Error(`Duplicate handler registered for state: ${handler.name}`);
      }
      handlerMap.set(handler.name, handler);
    }

    for (const name of this.order) {
      if (!handlerMap.has(name)) {
        throw new Error(`Missing handler for state: ${name}`);
      }
    }

    this.handlers = handlerMap;
  }

  /** Retrieve the handler for a given state. */
  getHandler(state: StateName): StateHandler {
    const handler = this.handlers.get(state);
    if (!handler) {
      throw new Error(`No handler registered for state: ${state}`);
    }
    return handler;
  }

  /**
   * Determine the next state after executing the current one.
   *
   * Resolution order:
   * 1. If the result specifies an explicit nextState, use it.
   * 2. If the outcome is "escalated", jump to ESCALATE.
   * 3. If the current state is terminal, return null (workflow complete).
   * 4. Otherwise advance to the next state in canonical order.
   */
  resolveNextState(current: StateName, result: StateResult): StateName | null {
    if (result.nextState !== undefined) {
      return result.nextState;
    }

    if (result.outcome === "escalated") {
      return StateName.ESCALATE;
    }

    if (this.isTerminal(current)) {
      return null;
    }

    const idx = this.order.indexOf(current);
    if (idx === -1 || idx >= this.order.length - 1) {
      return null;
    }
    return this.order[idx + 1];
  }

  /** Check whether a state is terminal (no further transitions). */
  isTerminal(state: StateName): boolean {
    return TERMINAL_STATES.has(state);
  }

  /** Return the canonical ordered list of all states. */
  getStateOrder(): readonly StateName[] {
    return this.order;
  }

  /** Return all registered state names. */
  getRegisteredStates(): StateName[] {
    return [...this.handlers.keys()];
  }

  /**
   * Execute a single state and return its result.
   * Policy enforcement (retries, timeouts) will wrap this in later phases.
   */
  async executeState(
    state: StateName,
    context: StateContext,
  ): Promise<StateResult> {
    const handler = this.getHandler(state);
    return handler.execute(context);
  }
}
