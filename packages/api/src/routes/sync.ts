import { Router } from "express";
import { AtsType, JobStatus } from "@dejsol/core";
import { ApiError } from "../middleware/error-handler.js";
import type { PrismaClient, Prisma } from "@prisma/client";
import type { ApiResponse } from "../types.js";

/**
 * POST /api/candidates/sync and POST /api/jobs/sync
 * ---------------------------------------------------------------------------
 * Idempotent upsert endpoints that CandidateOS (Mongo) calls before
 * POST /api/runs, so that the FK chain on apply_runs (job_id →
 * job_opportunities.id, candidate_id → candidates.id) is satisfied.
 *
 * The captured production log from PR #25 showed P2003 on
 * `apply_runs_job_id_fkey` because CandidateOS sends Mongo `_id` values
 * that have no matching row in Autopilot's Postgres. These endpoints
 * close that gap:
 *
 *   1. CandidateOS POST /api/candidates/sync  → upsert candidates row by id
 *   2. CandidateOS POST /api/jobs/sync        → upsert job_opportunities row by id
 *   3. CandidateOS POST /api/runs             → bootstrap apply_runs row (PR #25)
 *
 * Autopilot PKs are stored as `String` (not UUID), so CandidateOS's
 * 24-char Mongo ObjectId strings are valid primary keys when sent as-is.
 *
 * Both handlers are true upserts — retries and replays are safe. On
 * Prisma error they surface code/meta/message via the same defensive
 * extraction pattern PR #25 introduced in routes/runs.ts.
 */

export const candidatesSyncRouter = Router();
export const jobsSyncRouter = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Defensive Prisma error inspection. Avoids an `instanceof` import from
 * @prisma/client (runtime-heavy). Mirrors the pattern added to the
 * bootstrap catch in routes/runs.ts by PR #25.
 */
function inspectPrismaError(err: unknown): {
  errName: string;
  errCode: string | undefined;
  errMeta: unknown;
  errMessage: string;
  msgLine: string;
} {
  const e = err as {
    name?: unknown;
    code?: unknown;
    meta?: unknown;
    message?: unknown;
  } | null;
  const errName = typeof e?.name === "string" ? e.name : "Error";
  const errCode = typeof e?.code === "string" ? e.code : undefined;
  const errMeta = e && typeof e.meta === "object" ? e.meta : undefined;
  const errMessage =
    err instanceof Error
      ? err.message
      : typeof e?.message === "string"
        ? e.message
        : String(err);
  const msgLine =
    errMessage
      .split("\n")
      .map(s => s.trim())
      .find(s => s.length > 0) ?? "(empty)";
  return { errName, errCode, errMeta, errMessage, msgLine };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function asJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  if (v === null) return undefined;
  // Prisma accepts any JSON-serializable value. We trust the shape
  // because it's coming from CandidateOS (trusted producer) and we
  // never interpret individual keys on Autopilot's side beyond
  // passing them through.
  return v as Prisma.InputJsonValue;
}

// ---------------------------------------------------------------------------
// POST /api/candidates/sync
// ---------------------------------------------------------------------------

/**
 * Body shape (all JSON fields passthrough — Autopilot does not validate
 * their internal structure beyond requiring the top-level field):
 *
 *   {
 *     id: string (required, PK, e.g. Mongo _id)
 *     name: string (required)
 *     email: string (required)
 *     phone?: string | null
 *     driveFolderId?: string | null
 *     trackingSheetId?: string | null
 *     profileJson?: object (defaults to {} on create)
 *     answerBankJson?: object (only updated when provided)
 *     denylist?: string[] (only updated when provided)
 *     policiesJson?: object (only updated when provided)
 *   }
 */
candidatesSyncRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as {
      id?: unknown;
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      driveFolderId?: unknown;
      trackingSheetId?: unknown;
      profileJson?: unknown;
      answerBankJson?: unknown;
      denylist?: unknown;
      policiesJson?: unknown;
    };

    if (!isNonEmptyString(body.id) || !isNonEmptyString(body.name) || !isNonEmptyString(body.email)) {
      throw ApiError.badRequest(
        "Missing required fields: id, name, email",
      );
    }

    const id = body.id.trim();
    const name = body.name.trim();
    const email = body.email.trim();
    const phone = isNonEmptyString(body.phone) ? body.phone.trim() : null;
    const driveFolderId = isNonEmptyString(body.driveFolderId) ? body.driveFolderId.trim() : null;
    const trackingSheetId = isNonEmptyString(body.trackingSheetId) ? body.trackingSheetId.trim() : null;

    if (body.denylist !== undefined && !Array.isArray(body.denylist)) {
      throw ApiError.badRequest("denylist must be an array of strings");
    }
    const denylist =
      Array.isArray(body.denylist)
        ? body.denylist.filter((v): v is string => typeof v === "string")
        : undefined;

    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;
    if (!prismaClient) {
      throw ApiError.badRequest("Database not connected");
    }

    const profileJsonCreate = asJson(body.profileJson) ?? ({} as Prisma.InputJsonValue);
    const answerBankJson = asJson(body.answerBankJson);
    const policiesJson = asJson(body.policiesJson);

    try {
      const row = await prismaClient.candidate.upsert({
        where: { id },
        create: {
          id,
          name,
          email,
          phone,
          driveFolderId,
          trackingSheetId,
          profileJson: profileJsonCreate,
          ...(answerBankJson !== undefined && { answerBankJson }),
          ...(denylist !== undefined && { denylist }),
          ...(policiesJson !== undefined && { policiesJson }),
        },
        update: {
          name,
          email,
          phone,
          driveFolderId,
          trackingSheetId,
          ...(body.profileJson !== undefined && { profileJson: profileJsonCreate }),
          ...(answerBankJson !== undefined && { answerBankJson }),
          ...(denylist !== undefined && { denylist }),
          ...(policiesJson !== undefined && { policiesJson }),
        },
      });

      const response: ApiResponse<typeof row> = {
        success: true,
        data: row,
        message: "Candidate synced",
      };
      res.json(response);
    } catch (dbErr) {
      const { errName, errCode, errMeta, errMessage, msgLine } = inspectPrismaError(dbErr);

      console.warn(
        `[api/candidates/sync] upsert failed (${errCode ?? "no-code"}: ${msgLine})`,
        {
          route: "POST /api/candidates/sync",
          id,
          errName,
          errCode,
          errMeta,
          errMessage,
        },
      );

      res.status(500).json({
        success: false,
        error: errCode
          ? `Candidate upsert failed (${errCode}: ${msgLine})`
          : `Candidate upsert failed (${msgLine})`,
      } satisfies ApiResponse);
    }
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/sync
// ---------------------------------------------------------------------------

/**
 * Body shape:
 *
 *   {
 *     id: string (required, PK, e.g. Mongo _id)
 *     candidateId: string (required, FK → candidates.id)
 *     company: string (required)
 *     jobTitle: string (required)
 *     jobUrl: string (required)
 *     atsType: AtsType (required — WORKDAY|GREENHOUSE|LEVER|ASHBY|
 *              ICIMS|SMARTRECRUITERS|TALEO|SAP|CUSTOM)
 *     idempotencyKey: string (required, UNIQUE in Postgres)
 *     location?: string | null
 *     compensationJson?: object
 *     requirementsJson?: object
 *     fitScore?: number | null
 *     applyabilityScore?: number | null
 *     confidenceScore?: number | null
 *     status?: JobStatus (defaults to QUEUED on create)
 *   }
 *
 * On P2003 FK failure on candidate_id, returns 409 with a hint that the
 * candidate must be synced first via POST /api/candidates/sync.
 */
jobsSyncRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as {
      id?: unknown;
      candidateId?: unknown;
      company?: unknown;
      jobTitle?: unknown;
      jobUrl?: unknown;
      atsType?: unknown;
      idempotencyKey?: unknown;
      location?: unknown;
      compensationJson?: unknown;
      requirementsJson?: unknown;
      fitScore?: unknown;
      applyabilityScore?: unknown;
      confidenceScore?: unknown;
      status?: unknown;
    };

    if (
      !isNonEmptyString(body.id) ||
      !isNonEmptyString(body.candidateId) ||
      !isNonEmptyString(body.company) ||
      !isNonEmptyString(body.jobTitle) ||
      !isNonEmptyString(body.jobUrl) ||
      !isNonEmptyString(body.atsType) ||
      !isNonEmptyString(body.idempotencyKey)
    ) {
      throw ApiError.badRequest(
        "Missing required fields: id, candidateId, company, jobTitle, jobUrl, atsType, idempotencyKey",
      );
    }

    const atsType = body.atsType.trim().toUpperCase();
    if (!(Object.values(AtsType) as string[]).includes(atsType)) {
      throw ApiError.badRequest(
        `Invalid atsType: ${body.atsType}. Must be one of: ${Object.values(AtsType).join(", ")}`,
      );
    }

    const id = body.id.trim();
    const candidateId = body.candidateId.trim();
    const company = body.company.trim();
    const jobTitle = body.jobTitle.trim();
    const jobUrl = body.jobUrl.trim();
    const idempotencyKey = body.idempotencyKey.trim();
    const location = isNonEmptyString(body.location) ? body.location.trim() : null;

    let status: JobStatus | undefined;
    if (body.status !== undefined) {
      if (!isNonEmptyString(body.status)) {
        throw ApiError.badRequest("status must be a string");
      }
      const s = body.status.trim().toUpperCase();
      if (!(Object.values(JobStatus) as string[]).includes(s)) {
        throw ApiError.badRequest(
          `Invalid status: ${body.status}. Must be one of: ${Object.values(JobStatus).join(", ")}`,
        );
      }
      status = s as JobStatus;
    }

    const coerceNullableNumber = (v: unknown, field: string): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v !== "number" || Number.isNaN(v)) {
        throw ApiError.badRequest(`${field} must be a number or null`);
      }
      return v;
    };
    const fitScore = coerceNullableNumber(body.fitScore, "fitScore");
    const applyabilityScore = coerceNullableNumber(body.applyabilityScore, "applyabilityScore");
    const confidenceScore = coerceNullableNumber(body.confidenceScore, "confidenceScore");

    const compensationJson = asJson(body.compensationJson);
    const requirementsJson = asJson(body.requirementsJson);

    const prismaClient = req.app.locals.prismaClient as PrismaClient | undefined;
    if (!prismaClient) {
      throw ApiError.badRequest("Database not connected");
    }

    try {
      const row = await prismaClient.jobOpportunity.upsert({
        where: { id },
        create: {
          id,
          candidateId,
          company,
          jobTitle,
          jobUrl,
          atsType: atsType as AtsType,
          location,
          idempotencyKey,
          ...(compensationJson !== undefined && { compensationJson }),
          ...(requirementsJson !== undefined && { requirementsJson }),
          ...(fitScore !== undefined && { fitScore }),
          ...(applyabilityScore !== undefined && { applyabilityScore }),
          ...(confidenceScore !== undefined && { confidenceScore }),
          ...(status !== undefined && { status }),
        },
        update: {
          candidateId,
          company,
          jobTitle,
          jobUrl,
          atsType: atsType as AtsType,
          location,
          idempotencyKey,
          ...(compensationJson !== undefined && { compensationJson }),
          ...(requirementsJson !== undefined && { requirementsJson }),
          ...(fitScore !== undefined && { fitScore }),
          ...(applyabilityScore !== undefined && { applyabilityScore }),
          ...(confidenceScore !== undefined && { confidenceScore }),
          ...(status !== undefined && { status }),
        },
      });

      const response: ApiResponse<typeof row> = {
        success: true,
        data: row,
        message: "Job synced",
      };
      res.json(response);
    } catch (dbErr) {
      const { errName, errCode, errMeta, errMessage, msgLine } = inspectPrismaError(dbErr);

      // P2003 on candidate_id FK → CandidateOS must sync the parent
      // candidate first. Return 409 with an actionable message rather
      // than a generic 500 so the caller can branch.
      const fieldName =
        errMeta && typeof errMeta === "object" && "field_name" in errMeta
          ? (errMeta as { field_name?: unknown }).field_name
          : undefined;
      const constraint =
        errMeta && typeof errMeta === "object" && "constraint" in errMeta
          ? (errMeta as { constraint?: unknown }).constraint
          : undefined;
      const isCandidateFk =
        errCode === "P2003" &&
        ((typeof fieldName === "string" && /candidate_id/i.test(fieldName)) ||
          (typeof constraint === "string" && /candidate/i.test(constraint)));

      console.warn(
        `[api/jobs/sync] upsert failed (${errCode ?? "no-code"}: ${msgLine})`,
        {
          route: "POST /api/jobs/sync",
          id,
          candidateId,
          errName,
          errCode,
          errMeta,
          errMessage,
        },
      );

      if (isCandidateFk) {
        res.status(409).json({
          success: false,
          error: `Job upsert rejected: candidate '${candidateId}' does not exist. Sync it first via POST /api/candidates/sync (${errCode}: ${msgLine}).`,
        } satisfies ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: errCode
          ? `Job upsert failed (${errCode}: ${msgLine})`
          : `Job upsert failed (${msgLine})`,
      } satisfies ApiResponse);
    }
  } catch (err) {
    next(err);
  }
});
