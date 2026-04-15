/**
 * Production entry point — starts the API server.
 *
 * Used by the Dockerfile CMD and Railway deployments.
 * Reads all configuration from environment variables.
 */

import { startServer } from "./server.js";

startServer()
  .then(({ server }) => {
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : addr;
    console.log(`[api] Server ready on port ${port}`);
  })
  .catch((err) => {
    console.error("[api] Failed to start:", err);
    process.exit(1);
  });
