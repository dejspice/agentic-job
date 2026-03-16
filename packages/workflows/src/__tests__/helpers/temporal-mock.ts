/**
 * Lightweight Temporal workflow mock for unit tests.
 *
 * Load this file via `--require` BEFORE the test file so that
 * Module._load is patched before any workflow code is imported.
 *
 * Usage in test command:
 *   node --require tsx/cjs \
 *        --require ./src/__tests__/helpers/temporal-mock.ts \
 *        --test src/__tests__/apply-workflow.test.ts
 *
 * The mock provides test-friendly replacements for the three Temporal
 * workflow primitives used at runtime:
 *   - proxyActivities  → lazy proxy backed by configurable mocks
 *   - setHandler       → stores signal/query handlers in shared Maps
 *   - condition        → returns a Promise resolved by sendSignal
 *
 * defineSignal / defineQuery are forwarded to the real implementation
 * (they work outside a Temporal worker and produce the descriptor objects
 * that both the workflow and tests consume).
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

// In tsx/cjs mode all TypeScript is loaded as CommonJS, so `require` and
// `__filename` are available at runtime.  We declare them here so tsc
// (running with noEmit for type-checking) understands the globals.
declare const require: NodeRequire;

// ---------------------------------------------------------------------------
// Bootstrap: access the Node.js Module class
// ---------------------------------------------------------------------------

const _NodeModule = require("module") as {
  Module: { _load: (id: string, parent: unknown, isMain: boolean) => unknown };
};

// ---------------------------------------------------------------------------
// Shared mock state — reset between tests via mockHelpers.resetState()
// ---------------------------------------------------------------------------

type AnyFn = (...args: any[]) => any;

interface ConditionWaiter {
  predicate: () => boolean;
  resolve: (result: boolean) => void;
}

const _signalHandlers = new Map<string, AnyFn>();
const _queryHandlers = new Map<string, AnyFn>();
const _conditionWaiters: ConditionWaiter[] = [];
const _activityMocks = new Map<string, AnyFn>();

function _checkConditions(): void {
  for (let i = _conditionWaiters.length - 1; i >= 0; i--) {
    const waiter = _conditionWaiters[i]!;
    if (waiter.predicate()) {
      waiter.resolve(true);
      _conditionWaiters.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Patch Module._load to intercept @temporalio/workflow
// ---------------------------------------------------------------------------

// Pull defineSignal / defineQuery from the real package — they work fine
// outside a Temporal worker and produce structurally identical descriptors.
const _realTemporal = require("@temporalio/workflow") as {
  defineSignal: (name: string) => unknown;
  defineQuery: (name: string) => unknown;
};

const _originalLoad = _NodeModule.Module._load;

_NodeModule.Module._load = function interceptTemporalWorkflow(
  id: string,
  parent: unknown,
  isMain: boolean,
): unknown {
  if (id === "@temporalio/workflow") {
    return {
      defineSignal: _realTemporal.defineSignal,
      defineQuery: _realTemporal.defineQuery,

      setHandler(
        descriptor: { name: string; type?: string },
        handler: AnyFn,
      ): void {
        if (descriptor?.type === "query") {
          _queryHandlers.set(descriptor.name, handler);
        } else {
          _signalHandlers.set(descriptor.name, handler);
        }
      },

      condition(
        predicate: () => boolean,
        _timeout: string,
      ): Promise<boolean> {
        if (predicate()) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
          _conditionWaiters.push({ predicate, resolve });
        });
      },

      proxyActivities(_options: unknown): Record<string, AnyFn> {
        return new Proxy({} as Record<string, AnyFn>, {
          get(_target, name: string) {
            return (...args: unknown[]) => {
              const fn = _activityMocks.get(name);
              if (!fn) {
                throw new Error(
                  `[temporal-mock] Activity mock not configured for: ${name}`,
                );
              }
              return fn(...args);
            };
          },
        });
      },
    };
  }
  return _originalLoad.call(this, id, parent, isMain);
};

// ---------------------------------------------------------------------------
// Exported test helpers
// ---------------------------------------------------------------------------

export interface MockActivityFn {
  (...args: unknown[]): Promise<unknown>;
}

/**
 * Test helpers for interacting with the mocked Temporal runtime.
 * Import this in your test file (it is also the --require setup module).
 */
export const mockHelpers = {
  /**
   * Clear all registered handlers, condition waiters, and activity mocks.
   * Call in beforeEach to keep tests isolated.
   */
  resetState(): void {
    _signalHandlers.clear();
    _queryHandlers.clear();
    _conditionWaiters.length = 0;
    _activityMocks.clear();
  },

  /**
   * Register a mock implementation for a named activity.
   * The proxy resolves calls lazily, so mocks can be set before or after
   * applyWorkflow() starts — as long as they are set before each activity
   * is actually invoked.
   */
  setActivityMock(name: string, fn: MockActivityFn): void {
    _activityMocks.set(name, fn);
  },

  /**
   * Simulate a signal arriving at the workflow.
   * 1. Calls the registered signal handler with the given payload.
   * 2. Re-evaluates pending condition() waiters so a waiting workflow
   *    can proceed in the next microtask tick.
   */
  sendSignal(signalName: string, payload: unknown): void {
    const handler = _signalHandlers.get(signalName);
    if (!handler) {
      throw new Error(
        `[temporal-mock] No signal handler registered for: ${signalName}`,
      );
    }
    handler(payload);
    _checkConditions();
  },

  /**
   * Invoke a registered query handler and return its snapshot value.
   * Useful for asserting workflow phase / state mid-flight.
   */
  queryState(queryName: string): unknown {
    const handler = _queryHandlers.get(queryName);
    if (!handler) {
      throw new Error(
        `[temporal-mock] No query handler registered for: ${queryName}`,
      );
    }
    return handler();
  },
};
