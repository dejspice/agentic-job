/**
 * Integration tests for POST /api/candidates/sync and POST /api/jobs/sync
 * (packages/api/src/routes/sync.ts).
 *
 * Validates:
 *   - Required-field validation (400 on missing id/name/email etc.)
 *   - Upsert semantics: first call creates, second call updates with
 *     the exact same id.
 *   - AtsType normalization (lowercase → uppercase; unknown → 400).
 *   - P2003 FK error on candidate_id returns 409 with an actionable
 *     "sync candidate first" message.
 *   - Generic Prisma error (e.g. P1001) returns 500 with code surfaced.
 *   - Happy-path response shape matches ApiResponse<T>.
 *
 * No real database is used — a minimal fake PrismaClient captures calls
 * to candidate.upsert and jobOpportunity.upsert, and can be instructed
 * to throw a Prisma-shaped error on demand.
 *
 * Drives the real Express app via http.request against app.listen(0)
 * so middleware ordering and route mounting are exercised end-to-end.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../server.js";

// ---------------------------------------------------------------------------
// Fake PrismaClient
// ---------------------------------------------------------------------------

interface UpsertCall {
  where: { id: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

interface FakePrisma {
  client: PrismaClient;
  calls: { candidate: UpsertCall[]; job: UpsertCall[] };
  setCandidateError: (err: unknown | null) => void;
  setJobError: (err: unknown | null) => void;
  setCandidateResult: (fn: (c: UpsertCall) => Record<string, unknown>) => void;
  setJobResult: (fn: (c: UpsertCall) => Record<string, unknown>) => void;
}

function makeFakePrisma(): FakePrisma {
  const calls = { candidate: [] as UpsertCall[], job: [] as UpsertCall[] };
  let candidateError: unknown | null = null;
  let jobError: unknown | null = null;
  let candidateResult: (c: UpsertCall) => Record<string, unknown> = (c) => ({
    id: c.where.id,
    ...c.create,
    createdAt: new Date("2026-04-19T22:00:00.000Z"),
    updatedAt: new Date("2026-04-19T22:00:00.000Z"),
  });
  let jobResult: (c: UpsertCall) => Record<string, unknown> = (c) => ({
    id: c.where.id,
    ...c.create,
    createdAt: new Date("2026-04-19T22:00:00.000Z"),
  });

  const client = {
    candidate: {
      upsert: async (args: UpsertCall) => {
        calls.candidate.push(args);
        if (candidateError) throw candidateError;
        return candidateResult(args);
      },
    },
    jobOpportunity: {
      upsert: async (args: UpsertCall) => {
        calls.job.push(args);
        if (jobError) throw jobError;
        return jobResult(args);
      },
    },
  } as unknown as PrismaClient;

  return {
    client,
    calls,
    setCandidateError: (err) => { candidateError = err; },
    setJobError: (err) => { jobError = err; },
    setCandidateResult: (fn) => { candidateResult = fn; },
    setJobResult: (fn) => { jobResult = fn; },
  };
}

// A Prisma-shaped known request error. We don't import
// @prisma/client's PrismaClientKnownRequestError because the production
// code explicitly avoids that runtime dependency too — we construct a
// duck-typed equivalent that hits the same defensive inspection path.
function prismaKnownError(code: string, message: string, meta?: Record<string, unknown>): Error & { code: string; meta?: unknown } {
  const err = new Error(message) as Error & { code: string; meta?: unknown };
  err.name = "PrismaClientKnownRequestError";
  err.code = code;
  if (meta !== undefined) err.meta = meta;
  return err;
}

// ---------------------------------------------------------------------------
// HTTP harness
// ---------------------------------------------------------------------------

interface TestHarness {
  server: http.Server;
  port: number;
  fake: FakePrisma;
  close: () => Promise<void>;
  post: (path: string, body: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
}

async function startHarness(): Promise<TestHarness> {
  // Disable API key auth for the in-process harness. apiKeyAuth is a
  // no-op when AUTOPILOT_API_KEY is unset, matching the existing test
  // convention (tests do not exercise the auth middleware).
  delete process.env["AUTOPILOT_API_KEY"];
  const fake = makeFakePrisma();
  const app = createApp({ prismaClient: fake.client });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  const post = (path: string, body: unknown) =>
    new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const payload = Buffer.from(JSON.stringify(body));
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": String(payload.length),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: Record<string, unknown>;
            try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

  return {
    server,
    port,
    fake,
    post,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/candidates/sync", () => {
  let h: TestHarness;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });

  it("rejects missing id with 400", async () => {
    const res = await h.post("/api/candidates/sync", {
      name: "Alice", email: "alice@example.com",
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it("rejects missing email with 400", async () => {
    const res = await h.post("/api/candidates/sync", {
      id: "68baa89f0c71a6827377cf56", name: "Alice",
    });
    assert.equal(res.status, 400);
  });

  it("upserts by id and returns 200 (happy path)", async () => {
    h.fake.setCandidateError(null);
    h.fake.calls.candidate.length = 0;
    const res = await h.post("/api/candidates/sync", {
      id: "68baa89f0c71a6827377cf56",
      name: "Alice Example",
      email: "alice@example.com",
      phone: "+15555550100",
      profileJson: { firstName: "Alice", lastName: "Example" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(h.fake.calls.candidate.length, 1);
    const call = h.fake.calls.candidate[0]!;
    assert.equal(call.where.id, "68baa89f0c71a6827377cf56");
    assert.equal(call.create.id, "68baa89f0c71a6827377cf56");
    assert.equal(call.create.name, "Alice Example");
    assert.equal(call.create.email, "alice@example.com");
    assert.equal(call.update.name, "Alice Example");
  });

  it("defaults profileJson to {} when omitted", async () => {
    h.fake.calls.candidate.length = 0;
    const res = await h.post("/api/candidates/sync", {
      id: "cand-without-profile",
      name: "Bob",
      email: "bob@example.com",
    });
    assert.equal(res.status, 200);
    const call = h.fake.calls.candidate[0]!;
    assert.deepEqual(call.create.profileJson, {});
    assert.equal("profileJson" in call.update, false);
  });

  it("surfaces Prisma error code in error message on upsert failure", async () => {
    h.fake.setCandidateError(prismaKnownError("P1001", "Can't reach database server"));
    const res = await h.post("/api/candidates/sync", {
      id: "cand-001", name: "Alice", email: "alice@example.com",
    });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.match(String(res.body.error), /P1001/);
    h.fake.setCandidateError(null);
  });
});

describe("POST /api/jobs/sync", () => {
  let h: TestHarness;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });

  const validBody = {
    id: "69e5557a34c1d374cead07ce",
    candidateId: "68baa89f0c71a6827377cf56",
    company: "Robinhood",
    jobTitle: "SEO Analyst",
    jobUrl: "https://job-boards.greenhouse.io/robinhood/jobs/7592180",
    atsType: "GREENHOUSE",
    idempotencyKey: "69e5557a34c1d374cead07ce",
  };

  it("rejects missing required fields with 400", async () => {
    const res = await h.post("/api/jobs/sync", {
      id: "j1", candidateId: "c1", company: "Acme",
    });
    assert.equal(res.status, 400);
  });

  it("rejects unknown atsType with 400", async () => {
    const res = await h.post("/api/jobs/sync", { ...validBody, atsType: "NOT_AN_ATS" });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /Invalid atsType/);
  });

  it("normalizes lowercase atsType to uppercase", async () => {
    h.fake.setJobError(null);
    h.fake.calls.job.length = 0;
    const res = await h.post("/api/jobs/sync", { ...validBody, atsType: "greenhouse" });
    assert.equal(res.status, 200);
    const call = h.fake.calls.job[0]!;
    assert.equal(call.create.atsType, "GREENHOUSE");
  });

  it("upserts by id on happy path", async () => {
    h.fake.setJobError(null);
    h.fake.calls.job.length = 0;
    const res = await h.post("/api/jobs/sync", validBody);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const call = h.fake.calls.job[0]!;
    assert.equal(call.where.id, validBody.id);
    assert.equal(call.create.candidateId, validBody.candidateId);
    assert.equal(call.create.jobUrl, validBody.jobUrl);
    assert.equal(call.create.idempotencyKey, validBody.idempotencyKey);
  });

  it("returns 409 with 'sync candidate first' hint on P2003 candidate_id FK", async () => {
    h.fake.setJobError(
      prismaKnownError(
        "P2003",
        "Foreign key constraint violated on the constraint: `job_opportunities_candidate_id_fkey`",
        { modelName: "JobOpportunity", field_name: "candidate_id", constraint: "job_opportunities_candidate_id_fkey" },
      ),
    );
    const res = await h.post("/api/jobs/sync", validBody);
    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(String(res.body.error), /candidate/);
    assert.match(String(res.body.error), /sync it first/i);
    assert.match(String(res.body.error), /P2003/);
    h.fake.setJobError(null);
  });

  it("returns 500 on generic Prisma error (non-candidate FK)", async () => {
    h.fake.setJobError(prismaKnownError("P1001", "Can't reach database server"));
    const res = await h.post("/api/jobs/sync", validBody);
    assert.equal(res.status, 500);
    assert.match(String(res.body.error), /P1001/);
    h.fake.setJobError(null);
  });
});
