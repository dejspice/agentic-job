import type { Request, Response, NextFunction } from "express";

/**
 * Lightweight request-logging middleware.
 * Logs method, path, status code, and duration for every request.
 */
export function requestLogging(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const { statusCode } = res;
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    const line = `[api] ${method} ${originalUrl} ${statusCode} ${durationMs}ms`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  });

  next();
}
