import type { Request, Response, NextFunction } from "express";

/**
 * Simple API key authentication middleware.
 *
 * Checks the `x-api-key` header against the `AUTOPILOT_API_KEY` env var.
 * When the env var is not set, all requests are allowed (dev/test mode).
 *
 * Usage:
 *   router.use(apiKeyAuth);            // protect all routes on router
 *   router.get("/x", apiKeyAuth, h);   // protect a single route
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env["AUTOPILOT_API_KEY"]?.trim();

  if (!expectedKey) {
    return next();
  }

  const provided = req.headers["x-api-key"];
  if (provided === expectedKey) {
    return next();
  }

  res.status(401).json({
    success: false,
    error: "Invalid or missing x-api-key header",
  });
}
