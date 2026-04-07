import { Router } from "express";
import { ApiError } from "../middleware/error-handler.js";
import type { PrismaClient } from "@prisma/client";
import type {
  CandidateListQuery,
  ApiResponse,
  CandidateListResponse,
} from "../types.js";

export const candidatesRouter = Router();

/**
 * GET /api/candidates — List candidates.
 */
candidatesRouter.get("/", async (req, res, next) => {
  try {
    const query = req.query as CandidateListQuery;
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (prismaClient) {
      const [candidates, total] = await Promise.all([
        prismaClient.candidate.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, email: true, phone: true, createdAt: true },
        }),
        prismaClient.candidate.count(),
      ]);
      const response: CandidateListResponse = {
        success: true,
        data: candidates as never,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
      return res.json(response);
    }

    const response: CandidateListResponse = {
      success: true,
      data: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/candidates/:id — Get a single candidate with profile details.
 */
candidatesRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;

    if (prismaClient) {
      const candidate = await prismaClient.candidate.findUnique({
        where: { id },
        select: {
          id: true, name: true, email: true, phone: true,
          profileJson: true, createdAt: true, updatedAt: true,
          _count: { select: { runs: true, jobs: true } },
        },
      });
      if (!candidate) throw ApiError.notFound("Candidate", id);
      return res.json({ success: true, data: candidate });
    }

    throw ApiError.notFound("Candidate", id);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/candidates/:id/jobs — List jobs for a specific candidate.
 */
candidatesRouter.get("/:id/jobs", (req, res, next) => {
  try {
    const { id: _candidateId } = req.params;
    const page = parseInt((req.query.page as string) ?? "1", 10);
    const pageSize = parseInt((req.query.pageSize as string) ?? "20", 10);

    // Stub: In production, query jobs filtered by candidateId
    const response: ApiResponse<unknown[]> = {
      success: true,
      data: [],
      message: `Jobs for candidate listed`,
    };
    void page;
    void pageSize;
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/candidates/:id/runs — List runs for a specific candidate.
 */
candidatesRouter.get("/:id/runs", (req, res, next) => {
  try {
    const { id: _candidateId } = req.params;

    // Stub: In production, query runs filtered by candidateId
    const response: ApiResponse<unknown[]> = {
      success: true,
      data: [],
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});
