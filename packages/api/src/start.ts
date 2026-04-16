/**
 * Production entry point — starts the API server.
 *
 * Used by the Dockerfile CMD and Railway deployments.
 * Reads all configuration from environment variables.
 */

import { startServer } from "./server.js";

const temporalAddress = process.env.TEMPORAL_ADDRESS;

startServer({
  // Enable Temporal client when TEMPORAL_ADDRESS is configured.
  // startServer() will call TemporalClientWrapper.connect() which reads
  // TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE from env, but the `temporal`
  // key must be present in the config for the connect path to trigger.
  ...(temporalAddress ? { temporal: { address: temporalAddress } } : {}),
})
  .then(({ server }) => {
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : addr;
    console.log(`[api] Server ready on port ${port}`);
  })
  .catch((err) => {
    console.error("[api] Failed to start:", err);
    process.exit(1);
  });
