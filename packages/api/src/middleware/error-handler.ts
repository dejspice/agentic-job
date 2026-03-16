import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "../types.js";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static notFound(resource: string, id?: string): ApiError {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    return new ApiError(404, msg);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(500, message);
  }
}

/**
 * Centralized error-handling middleware.
 * Must be registered after all route handlers.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    const body: ApiResponse = {
      success: false,
      error: err.message,
    };
    res.status(err.statusCode).json(body);
    return;
  }

  console.error("[api] unhandled error:", err);

  const body: ApiResponse = {
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  };
  res.status(500).json(body);
}
