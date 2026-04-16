/**
 * Temporal worker entry point.
 *
 * Connects to the Temporal server, bundles the applyWorkflow code,
 * registers activities, and starts polling the "apply-workflow" task queue.
 *
 * Required env vars:
 *   TEMPORAL_ADDRESS  — Temporal gRPC endpoint (default: localhost:7233)
 *   TEMPORAL_NAMESPACE — Temporal namespace (default: "default")
 *
 * Run with:  node packages/worker/dist/start.js
 */

import { NativeConnection, Worker, bundleWorkflowCode } from "@temporalio/worker";
import {
  initActivity,
  browserActivity,
  submitActivity,
  captureActivity,
  runGreenhouseHappyPathActivity,
  enterVerificationCodeActivity,
} from "@dejsol/workflows";

const activities = {
  initActivity,
  browserActivity,
  submitActivity,
  captureActivity,
  runGreenhouseHappyPathActivity,
  enterVerificationCodeActivity,
};

const TASK_QUEUE = "apply-workflow";

async function run(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

  console.log(`[worker] Connecting to Temporal at ${address} (namespace: ${namespace})...`);

  const connection = await NativeConnection.connect({ address });

  console.log("[worker] Bundling workflow code...");
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: require.resolve("@dejsol/workflows/dist/apply-workflow.js"),
  });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: TASK_QUEUE,
    workflowBundle,
    activities,
  });

  console.log(`[worker] Polling task queue "${TASK_QUEUE}"...`);

  // Worker.run() blocks until the worker is shut down (SIGINT / SIGTERM).
  await worker.run();
  console.log("[worker] Worker shut down gracefully.");
}

run().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
