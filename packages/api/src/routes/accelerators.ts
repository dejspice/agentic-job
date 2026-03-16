import { Router } from "express";
import { AtsType } from "@dejsol/core";
import { ApiError } from "../middleware/error-handler.js";
import type { ApiResponse, AcceleratorListResponse } from "../types.js";
import type { AtsAccelerator } from "@dejsol/core";

export const acceleratorsRouter = Router();

/**
 * GET /api/accelerators — List all registered accelerator packs with summary metadata.
 */
acceleratorsRouter.get("/", (_req, res, next) => {
  try {
    // Stub: In production, this will:
    // 1. Call registeredAtsTypes() from @dejsol/accelerators
    // 2. For each, call getAccelerator() and extract summary metadata
    // 3. Return list with atsType, version, successRate

    const response: AcceleratorListResponse = {
      success: true,
      data: [],
      message: "No accelerators loaded in stub mode",
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/accelerators/:atsType — Get full accelerator pack for an ATS type.
 */
acceleratorsRouter.get("/:atsType", (req, res, next) => {
  try {
    const { atsType } = req.params;

    if (!Object.values(AtsType).includes(atsType as AtsType)) {
      throw ApiError.badRequest(
        `Invalid ATS type: ${atsType}. Valid types: ${Object.values(AtsType).join(", ")}`,
      );
    }

    // Stub: In production, this will:
    // 1. Call getAccelerator(atsType) from @dejsol/accelerators
    // 2. Return the full accelerator pack or 404

    throw ApiError.notFound("Accelerator", atsType);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/accelerators/:atsType/classifiers — Get page classifiers for an ATS type.
 */
acceleratorsRouter.get("/:atsType/classifiers", (req, res, next) => {
  try {
    const { atsType } = req.params;

    if (!Object.values(AtsType).includes(atsType as AtsType)) {
      throw ApiError.badRequest(`Invalid ATS type: ${atsType}`);
    }

    // Stub: In production, extract classifiers from the accelerator pack
    const response: ApiResponse<unknown[]> = {
      success: true,
      data: [],
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/accelerators/:atsType/schemas — Get form schemas for an ATS type.
 */
acceleratorsRouter.get("/:atsType/schemas", (req, res, next) => {
  try {
    const { atsType } = req.params;

    if (!Object.values(AtsType).includes(atsType as AtsType)) {
      throw ApiError.badRequest(`Invalid ATS type: ${atsType}`);
    }

    // Stub: In production, extract form schemas from the accelerator pack
    const response: ApiResponse<unknown[]> = {
      success: true,
      data: [],
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});
