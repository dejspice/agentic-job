import { Router } from "express";
import { AtsType, JobStatus } from "@dejsol/core";
import { ApiError } from "../middleware/error-handler.js";
import type {
  IngestJobBody,
  JobListQuery,
  ApiResponse,
  JobListResponse,
} from "../types.js";
import type { JobOpportunity } from "@dejsol/core";

export const jobsRouter = Router();

/**
 * POST /api/jobs — Ingest a new job opportunity.
 *
 * Validates the payload, normalizes the job, checks idempotency,
 * and persists the job record.
 */
jobsRouter.post("/", (req, res, next) => {
  try {
    const body = req.body as IngestJobBody;

    if (!body.candidateId || !body.company || !body.jobTitle || !body.jobUrl) {
      throw ApiError.badRequest(
        "Missing required fields: candidateId, company, jobTitle, jobUrl",
      );
    }

    if (body.atsType && !Object.values(AtsType).includes(body.atsType)) {
      throw ApiError.badRequest(`Invalid atsType: ${body.atsType}`);
    }

    // Stub: In production, this will:
    // 1. Compute idempotency key from (candidateId, company, jobTitle, jobUrl)
    // 2. Check for duplicate via idempotency key
    // 3. Run ATS detection if atsType not provided
    // 4. Compute fit/applyability/confidence scores via job-intake
    // 5. Persist to database
    // 6. Trigger tracking sheet sync

    const stub: JobOpportunity = {
      id: crypto.randomUUID(),
      candidateId: body.candidateId,
      company: body.company,
      jobTitle: body.jobTitle,
      jobUrl: body.jobUrl,
      atsType: body.atsType ?? AtsType.CUSTOM,
      location: body.location ?? null,
      compensationJson: body.compensation ?? null,
      requirementsJson: body.requirements ?? null,
      fitScore: null,
      applyabilityScore: null,
      confidenceScore: null,
      status: JobStatus.QUEUED,
      idempotencyKey: `${body.candidateId}:${body.company}:${body.jobTitle}`,
      createdAt: new Date(),
    };

    const response: ApiResponse<JobOpportunity> = {
      success: true,
      data: stub,
      message: "Job ingested successfully",
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jobs — List job opportunities with optional filters.
 */
jobsRouter.get("/", (req, res, next) => {
  try {
    const query = req.query as JobListQuery;
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);

    // Stub: In production, query the database with filters
    const response: JobListResponse = {
      success: true,
      data: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jobs/:id — Get a single job opportunity.
 */
jobsRouter.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // Stub: In production, look up by ID in the database
    throw ApiError.notFound("Job", id);
  } catch (err) {
    next(err);
  }
});
