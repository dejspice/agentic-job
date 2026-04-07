import { Router } from "express";
import { ApiError } from "../middleware/error-handler.js";
import type { PrismaClient } from "@prisma/client";
import type {
  CandidateListQuery,
  ApiResponse,
  CandidateListResponse,
  CreateCandidateBody,
  UpdateCandidateBody,
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
 * POST /api/candidates — Create a new candidate profile.
 */
candidatesRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as CreateCandidateBody;
    if (!body.firstName?.trim() || !body.lastName?.trim() || !body.email?.trim()) {
      throw ApiError.badRequest("firstName, lastName, and email are required");
    }

    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;
    if (!prismaClient) {
      throw ApiError.badRequest("Database not connected");
    }

    const name = `${body.firstName.trim()} ${body.lastName.trim()}`;
    const candidate = await prismaClient.candidate.create({
      data: {
        name,
        email: body.email.trim(),
        phone: body.phone?.trim() ?? null,
        profileJson: {
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          city: body.city?.trim() ?? "",
          state: body.state?.trim() ?? "",
          country: body.country?.trim() ?? "United States",
          phone: body.phone?.trim() ?? "",
        },
        answerBankJson: {},
        policiesJson: {},
      },
    });

    res.status(201).json({ success: true, data: candidate });
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
 * PATCH /api/candidates/:id — Update candidate profile fields.
 */
candidatesRouter.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body as UpdateCandidateBody;
    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;
    if (!prismaClient) throw ApiError.badRequest("Database not connected");

    const existing = await prismaClient.candidate.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Candidate", id);

    const profile = (existing.profileJson ?? {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (body.firstName !== undefined) { profile.firstName = body.firstName.trim(); updates.name = `${body.firstName.trim()} ${(profile.lastName as string) ?? ""}`; }
    if (body.lastName !== undefined) { profile.lastName = body.lastName.trim(); updates.name = `${(profile.firstName as string) ?? ""} ${body.lastName.trim()}`; }
    if (body.firstName !== undefined && body.lastName !== undefined) { updates.name = `${body.firstName.trim()} ${body.lastName.trim()}`; }
    if (body.email !== undefined) { updates.email = body.email.trim(); }
    if (body.phone !== undefined) { updates.phone = body.phone.trim() || null; profile.phone = body.phone.trim(); }
    if (body.city !== undefined) { profile.city = body.city.trim(); }
    if (body.state !== undefined) { profile.state = body.state.trim(); }
    if (body.country !== undefined) { profile.country = body.country.trim(); }

    const candidate = await prismaClient.candidate.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...updates, profileJson: profile as any },
    });

    res.json({ success: true, data: candidate });
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
