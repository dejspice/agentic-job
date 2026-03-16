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

const DEFAULT_PORT = 4000;

export interface ServerConfig {
  port?: number;
  corsOrigin?: string | string[];
}

/**
 * Create and configure the Express application.
 * Returns the app instance (for testing) without starting the listener.
 */
export function createApp(config: ServerConfig = {}): express.Application {
  const app = express();

  // --- Global middleware ---
  app.use(cors({ origin: config.corsOrigin ?? "*" }));
  app.use(express.json());
  app.use(requestLogging);

  // --- Health endpoint ---
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "dejsol-api",
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
 * Returns a handle to close the server.
 */
export function startServer(config: ServerConfig = {}) {
  const port = config.port ?? parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const app = createApp(config);

  const server = app.listen(port, () => {
    console.log(`[api] Dejsol API server listening on port ${port}`);
  });

  return { app, server };
}
