import { Connection, Client } from "@temporalio/client";
import type { WorkflowHandle } from "@temporalio/client";
import type { ReviewDecisionBody } from "./types.js";

/**
 * Signal and query name constants.
 * These must match the names defined in packages/workflows/src/signals.ts
 * and packages/workflows/src/queries.ts.
 */
export const SIGNAL_NAMES = {
  REVIEW_APPROVAL: "reviewApproval",
  CANCEL_REQUEST: "cancelRequest",
} as const;

export const QUERY_NAMES = {
  CURRENT_STATE: "currentState",
  WORKFLOW_STATUS: "workflowStatus",
  PROGRESS: "progress",
} as const;

export const TASK_QUEUE = "apply-workflow" as const;

export interface TemporalConfig {
  /** Temporal server address (default: localhost:7233). */
  address?: string;
  /** Temporal namespace (default: "default"). */
  namespace?: string;
}

/**
 * Derives a Temporal workflow ID from a run ID.
 * Convention: `apply-{runId}` ensures workflow IDs are namespaced.
 */
export function getRunWorkflowId(runId: string): string {
  return `apply-${runId}`;
}

/**
 * Thin wrapper around the Temporal Client SDK.
 * Encapsulates connection lifecycle and provides typed helpers
 * for signaling and querying apply workflows.
 */
export class TemporalClientWrapper {
  private constructor(
    private readonly connection: Connection,
    private readonly client: Client,
  ) {}

  /**
   * Create a connected TemporalClientWrapper.
   * Call this once at server startup.
   */
  static async connect(config: TemporalConfig = {}): Promise<TemporalClientWrapper> {
    const address = config.address ?? process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
    const namespace = config.namespace ?? process.env.TEMPORAL_NAMESPACE ?? "default";

    const connection = await Connection.connect({ address });
    const client = new Client({ connection, namespace });

    console.log(`[api] Temporal client connected to ${address} (namespace: ${namespace})`);
    return new TemporalClientWrapper(connection, client);
  }

  /** Get a workflow handle by run ID. */
  getWorkflowHandle(runId: string): WorkflowHandle {
    const workflowId = getRunWorkflowId(runId);
    return this.client.workflow.getHandle(workflowId);
  }

  /**
   * Send a review approval signal to a workflow.
   * Maps ReviewDecisionBody to the workflow's ReviewApprovalPayload.
   */
  async signalReviewApproval(
    runId: string,
    decision: ReviewDecisionBody,
  ): Promise<void> {
    const handle = this.getWorkflowHandle(runId);
    await handle.signal(SIGNAL_NAMES.REVIEW_APPROVAL, {
      approved: decision.approved,
      edits: decision.edits,
      reviewerNote: decision.reviewerNote,
    });
  }

  /**
   * Send a cancel signal to a workflow.
   */
  async signalCancel(runId: string, reason: string): Promise<void> {
    const handle = this.getWorkflowHandle(runId);
    await handle.signal(SIGNAL_NAMES.CANCEL_REQUEST, { reason });
  }

  /**
   * Query the current state of a workflow.
   */
  async queryCurrentState(runId: string): Promise<string | null> {
    const handle = this.getWorkflowHandle(runId);
    return handle.query(QUERY_NAMES.CURRENT_STATE);
  }

  /**
   * Query the full workflow status.
   */
  async queryWorkflowStatus(runId: string): Promise<unknown> {
    const handle = this.getWorkflowHandle(runId);
    return handle.query(QUERY_NAMES.WORKFLOW_STATUS);
  }

  /**
   * Query the progress snapshot.
   */
  async queryProgress(runId: string): Promise<unknown> {
    const handle = this.getWorkflowHandle(runId);
    return handle.query(QUERY_NAMES.PROGRESS);
  }

  /** Get the underlying Temporal Client for advanced usage. */
  get raw(): Client {
    return this.client;
  }

  /** Close the Temporal connection. Call on server shutdown. */
  async close(): Promise<void> {
    await this.connection.close();
    console.log("[api] Temporal client connection closed");
  }
}
