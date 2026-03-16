import express from "express";
import cors from "cors";
import { requestLogging } from "./middleware/request-logging.js";
import { errorHandler } from "./middleware/error-handler.js";
import { jobsRouter } from "./routes/jobs.js";
import { runsRouter } from "./routes/runs.js";
import { candidatesRouter } from "./routes/candidates.js";
import { driveSyncRouter } from "./routes/drive-sync.js";
import { acceleratorsRouter } from "./routes/accelerators.js";
import { reviewRouter } from "./routes/review.js";
import type { TemporalClientWrapper, TemporalConfig } from "./temporal-client.js";

const DEFAULT_PORT = 4000;

export interface ServerConfig {
  port?: number;
  corsOrigin?: string | string[];
  /** Pre-configured Temporal client. When provided, enables workflow signaling. */
  temporalClient?: TemporalClientWrapper;
  /** Temporal connection config. Used to create a client during startServer if temporalClient is not provided. */
  temporal?: TemporalConfig;
}

/**
 * Module augmentation so route handlers can access the Temporal client
 * via req.app.locals with type safety.
 */
declare global {
  namespace Express {
    interface Locals {
      temporalClient?: TemporalClientWrapper;
    }
  }
}

/**
 * Create and configure the Express application.
 * Returns the app instance (for testing) without starting the listener.
 */
export function createApp(config: ServerConfig = {}): express.Application {
  const app = express();

  if (config.temporalClient) {
    app.locals.temporalClient = config.temporalClient;
  }

  // --- Global middleware ---
  app.use(cors({ origin: config.corsOrigin ?? "*" }));
  app.use(express.json());
  app.use(requestLogging);

  // --- Health endpoint ---
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "dejsol-api",
      temporalConnected: !!app.locals.temporalClient,
      timestamp: new Date().toISOString(),
    });
  });

  // --- Route modules ---
  app.use("/api/jobs", jobsRouter);
  app.use("/api/runs", runsRouter);
  app.use("/api/candidates", candidatesRouter);
  app.use("/api/drive-sync", driveSyncRouter);
  app.use("/api/accelerators", acceleratorsRouter);
  app.use("/api/review", reviewRouter);

  // --- 404 fallback ---
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: "Route not found",
    });
  });

  // --- Error handler (must be last) ---
  app.use(errorHandler);

  return app;
}

/**
 * Start the API server on the configured port.
 * Optionally connects to Temporal if config.temporal is provided.
 * Returns handles to close the server and Temporal connection.
 */
export async function startServer(config: ServerConfig = {}) {
  const port = config.port ?? parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

  let temporalClient = config.temporalClient;

  if (!temporalClient && config.temporal) {
    const { TemporalClientWrapper: Wrapper } = await import("./temporal-client.js");
    try {
      temporalClient = await Wrapper.connect(config.temporal);
    } catch (err) {
      console.warn("[api] Failed to connect to Temporal, review signaling will be unavailable:", err);
    }
  }

  const app = createApp({ ...config, temporalClient });

  const server = app.listen(port, () => {
    console.log(`[api] Dejsol API server listening on port ${port}`);
  });

  return {
    app,
    server,
    temporalClient,
    async close() {
      server.close();
      if (temporalClient) {
        await temporalClient.close();
      }
    },
  };
}
