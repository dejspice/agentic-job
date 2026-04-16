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
 * Optional:
 *   PORT — If set, starts a tiny HTTP health server (for Railway healthcheck).
 *
 * Run with:  node packages/worker/dist/start.js
 */

import http from "node:http";
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

let workerRunning = false;

/**
 * Minimal HTTP health server so Railway can verify the worker is alive.
 * Only starts when PORT is set (Railway injects PORT for every service).
 */
function startHealthServer(port: number): void {
  const server = http.createServer((_req, res) => {
    const status = workerRunning ? 200 : 503;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: workerRunning ? "ok" : "starting",
      service: "dejsol-worker",
      taskQueue: TASK_QUEUE,
      polling: workerRunning,
      timestamp: new Date().toISOString(),
    }));
  });
  server.listen(port, () => {
    console.log(`[worker] Health server listening on port ${port}`);
  });
}

async function run(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

  // Railway injects PORT for every service; use it for the health endpoint.
  const healthPort = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  if (healthPort) {
    startHealthServer(healthPort);
  }

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

  workerRunning = true;
  console.log(`[worker] Polling task queue "${TASK_QUEUE}"...`);

  // Worker.run() blocks until the worker is shut down (SIGINT / SIGTERM).
  await worker.run();
  workerRunning = false;
  console.log("[worker] Worker shut down gracefully.");
}

run().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
