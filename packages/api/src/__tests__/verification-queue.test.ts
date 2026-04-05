/**
 * Unit tests for queryVerificationRuns (packages/api/src/persistence.ts)
 *
 * Validates that queryVerificationRuns():
 *   1. Queries apply_runs WHERE outcome = VERIFICATION_REQUIRED newest-first.
 *   2. Maps fields correctly from the joined run + job record.
 *   3. Extracts postSubmitScreenshotUrl from artifactUrlsJson.screenshots.
 *   4. Falls back to startedAt when completedAt is null.
 *   5. Returns empty array when no rows match.
 *   6. Handles missing screenshots gracefully (no postSubmitScreenshotUrl key).
 *   7. Respects the limit parameter.
 *
 * No real database is used — a minimal mock PrismaClient is constructed
 * that captures the query arguments passed to applyRun.findMany().
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { queryVerificationRuns } from "../persistence.js";

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

interface CapturedQuery {
  where: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
}

function makeMockRow(overrides: Partial<{
  id: string;
  jobId: string;
  candidateId: string;
  completedAt: Date | null;
  startedAt: Date;
  artifactUrlsJson: unknown;
  job: { company: string; jobTitle: string; jobUrl: string };
}> = {}) {
  return {
    id: overrides.id ?? "run-vr-001",
    jobId: overrides.jobId ?? "job-001",
    candidateId: overrides.candidateId ?? "cand-001",
    completedAt: overrides.completedAt !== undefined
      ? overrides.completedAt
      : new Date("2026-01-01T12:00:00.000Z"),
    startedAt: overrides.startedAt ?? new Date("2026-01-01T11:50:00.000Z"),
    artifactUrlsJson: overrides.artifactUrlsJson !== undefined
      ? overrides.artifactUrlsJson
      : {
          screenshots: {
            "SUBMIT/post-submit": "memory://run-vr-001/SUBMIT/post-submit.png",
          },
        },
    job: overrides.job ?? {
      company: "Robinhood",
      jobTitle: "SEO Analyst",
      jobUrl: "https://job-boards.greenhouse.io/robinhood/jobs/7592180",
    },
  };
}

function makeMockPrisma(rows: ReturnType<typeof makeMockRow>[]): {
  prisma: PrismaClient;
  calls: CapturedQuery[];
} {
  const calls: CapturedQuery[] = [];
  const prisma = {
    applyRun: {
      findMany: async (args: CapturedQuery) => {
        calls.push(args);
        return rows;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("queryVerificationRuns", () => {
  let singleRow: ReturnType<typeof makeMockRow>;

  beforeEach(() => {
    singleRow = makeMockRow();
  });

  // ── Query contract ────────────────────────────────────────────────────────

  describe("query contract", () => {
    it("calls findMany with outcome = VERIFICATION_REQUIRED", async () => {
      const { prisma, calls } = makeMockPrisma([singleRow]);
      await queryVerificationRuns(prisma);
      assert.equal(calls[0]?.where.outcome, "VERIFICATION_REQUIRED");
    });

    it("includes the job relation", async () => {
      const { prisma, calls } = makeMockPrisma([singleRow]);
      await queryVerificationRuns(prisma);
      assert.deepEqual(calls[0]?.include, { job: true });
    });

    it("orders by completedAt descending", async () => {
      const { prisma, calls } = makeMockPrisma([singleRow]);
      await queryVerificationRuns(prisma);
      assert.deepEqual(calls[0]?.orderBy, { completedAt: "desc" });
    });

    it("applies the default limit of 50", async () => {
      const { prisma, calls } = makeMockPrisma([singleRow]);
      await queryVerificationRuns(prisma);
      assert.equal(calls[0]?.take, 50);
    });

    it("respects a custom limit", async () => {
      const { prisma, calls } = makeMockPrisma([singleRow]);
      await queryVerificationRuns(prisma, 10);
      assert.equal(calls[0]?.take, 10);
    });
  });

  // ── Field mapping ─────────────────────────────────────────────────────────

  describe("field mapping", () => {
    it("maps runId from run.id", async () => {
      const { prisma } = makeMockPrisma([singleRow]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result[0]?.runId, "run-vr-001");
    });

    it("maps company from run.job.company", async () => {
      const { prisma } = makeMockPrisma([singleRow]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result[0]?.company, "Robinhood");
    });

    it("maps jobTitle from run.job.jobTitle", async () => {
      const { prisma } = makeMockPrisma([singleRow]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result[0]?.jobTitle, "SEO Analyst");
    });

    it("maps jobUrl from run.job.jobUrl", async () => {
      const { prisma } = makeMockPrisma([singleRow]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(
        result[0]?.jobUrl,
        "https://job-boards.greenhouse.io/robinhood/jobs/7592180",
      );
    });

    it("maps completedAt as ISO string", async () => {
      const { prisma } = makeMockPrisma([singleRow]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result[0]?.completedAt, "2026-01-01T12:00:00.000Z");
    });

    it("falls back to startedAt when completedAt is null", async () => {
      const row = makeMockRow({ completedAt: null });
      const { prisma } = makeMockPrisma([row]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result[0]?.completedAt, "2026-01-01T11:50:00.000Z");
    });
  });

  // ── Screenshot extraction ─────────────────────────────────────────────────

  describe("postSubmitScreenshotUrl extraction", () => {
    it("extracts URL from screenshots key containing 'post-submit'", async () => {
      const { prisma } = makeMockPrisma([singleRow]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(
        result[0]?.postSubmitScreenshotUrl,
        "memory://run-vr-001/SUBMIT/post-submit.png",
      );
    });

    it("omits postSubmitScreenshotUrl when screenshots is empty", async () => {
      const row = makeMockRow({ artifactUrlsJson: { screenshots: {} } });
      const { prisma } = makeMockPrisma([row]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result[0]?.postSubmitScreenshotUrl, undefined);
    });

    it("omits postSubmitScreenshotUrl when artifactUrlsJson is empty", async () => {
      const row = makeMockRow({ artifactUrlsJson: {} });
      const { prisma } = makeMockPrisma([row]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result[0]?.postSubmitScreenshotUrl, undefined);
    });

    it("finds screenshot with lowercase key variant", async () => {
      const row = makeMockRow({
        artifactUrlsJson: {
          screenshots: { "post-submit": "memory://run-vr-002/post-submit.png" },
        },
      });
      const { prisma } = makeMockPrisma([row]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(
        result[0]?.postSubmitScreenshotUrl,
        "memory://run-vr-002/post-submit.png",
      );
    });
  });

  // ── Empty result ──────────────────────────────────────────────────────────

  describe("empty results", () => {
    it("returns an empty array when no VERIFICATION_REQUIRED runs exist", async () => {
      const { prisma } = makeMockPrisma([]);
      const result = await queryVerificationRuns(prisma);
      assert.deepEqual(result, []);
    });
  });

  // ── Multiple rows ─────────────────────────────────────────────────────────

  describe("multiple rows", () => {
    it("maps all returned rows", async () => {
      const row1 = makeMockRow({ id: "run-vr-001" });
      const row2 = makeMockRow({
        id: "run-vr-002",
        jobId: "job-002",
        candidateId: "cand-002",
        completedAt: new Date("2026-01-01T13:00:00.000Z"),
        job: { company: "Anthropic", jobTitle: "ML Engineer", jobUrl: "https://anthropic.com/jobs/1" },
        artifactUrlsJson: {},
      });
      const { prisma } = makeMockPrisma([row1, row2]);
      const result = await queryVerificationRuns(prisma);
      assert.equal(result.length, 2);
      assert.equal(result[0]?.runId, "run-vr-001");
      assert.equal(result[1]?.runId, "run-vr-002");
      assert.equal(result[1]?.company, "Anthropic");
    });
  });
});
