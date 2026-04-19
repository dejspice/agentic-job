/**
 * Integration tests for the jobUrl/atsType resolution fallback inside
 * POST /api/runs (packages/api/src/routes/runs.ts).
 *
 * Validates that when CandidateOS (or any caller) does NOT send jobUrl
 * and/or atsType on POST /api/runs, the handler resolves the missing
 * fields from the job_opportunities row keyed by body.jobId. This
 * closes the silent "workflow never started" trap observed in
 * production, where the worker sat idle because the start-workflow
 * guard quietly failed on missing body fields.
 *
 * Covered paths:
 *   1. Body supplies both jobUrl + atsType → workflow started, no DB
 *      lookup (unchanged behavior).
 *   2. Body omits jobUrl + atsType → handler looks up job_opportunities,
 *      calls startWorkflow with the resolved values, returns
 *      "Run started and workflow triggered".
 *   3. Body omits both AND no matching job row → startWorkflow is NOT
 *      called, response message surfaces an explicit
 *      "workflow not started — jobUrl and atsType unavailable" warning.
 *   4. Body supplies jobUrl but not atsType (partial) → handler
 *      resolves atsType from DB and still starts workflow.
 *
 * Uses an in-process http harness + mock PrismaClient + mock Temporal
 * client. Same style as src/__tests__/sync.test.ts.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../server.js";
import type { TemporalClientWrapper } from "../temporal-client.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakePrisma {
  client: PrismaClient;
  setJobRow: (row: { jobUrl: string | null; atsType: string } | null) => void;
  applyRunCreateCalls: Array<Record<string, unknown>>;
  jobFindCalls: Array<{ where: { id: string }; select: unknown }>;
}

function makeFakePrisma(): FakePrisma {
  let jobRow: { jobUrl: string | null; atsType: string } | null = null;
  const applyRunCreateCalls: Array<Record<string, unknown>> = [];
  const jobFindCalls: Array<{ where: { id: string }; select: unknown }> = [];

  const client = {
    applyRun: {
      create: async (args: { data: Record<string, unknown> }) => {
        applyRunCreateCalls.push(args.data);
        return { id: args.data["id"], ...args.data };
      },
    },
    jobOpportunity: {
      findUnique: async (args: { where: { id: string }; select: unknown }) => {
        jobFindCalls.push(args);
        return jobRow;
      },
    },
  } as unknown as PrismaClient;

  return {
    client,
    applyRunCreateCalls,
    jobFindCalls,
    setJobRow: (row) => { jobRow = row; },
  };
}

interface StartWorkflowCall {
  runId: string;
  input: Record<string, unknown>;
}

function makeFakeTemporal(): {
  client: TemporalClientWrapper;
  calls: StartWorkflowCall[];
} {
  const calls: StartWorkflowCall[] = [];
  const client = {
    startWorkflow: async (runId: string, input: Record<string, unknown>) => {
      calls.push({ runId, input });
      return `wf-${runId}`;
    },
    queryWorkflowStatus: async () => ({
      currentState: null,
      phase: "initializing",
      statesCompleted: [],
      errors: [],
    }),
    queryProgress: async () => ({ percentComplete: 0 }),
    signalVerificationCode: async () => undefined,
    close: async () => undefined,
  } as unknown as TemporalClientWrapper;
  return { client, calls };
}

// ---------------------------------------------------------------------------
// HTTP harness
// ---------------------------------------------------------------------------

interface TestHarness {
  server: http.Server;
  port: number;
  fake: FakePrisma;
  temporal: ReturnType<typeof makeFakeTemporal>;
  close: () => Promise<void>;
  post: (path: string, body: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
}

async function startHarness(): Promise<TestHarness> {
  delete process.env["AUTOPILOT_API_KEY"];
  const fake = makeFakePrisma();
  const temporal = makeFakeTemporal();
  const app = createApp({ prismaClient: fake.client, temporalClient: temporal.client });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", () => resolve()); });
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
          headers: { "content-type": "application/json", "content-length": String(payload.length) },
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
    temporal,
    post,
    close: () => new Promise<void>((resolve, reject) => { server.close((err) => (err ? reject(err) : resolve())); }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/runs — jobUrl/atsType resolution", () => {
  let h: TestHarness;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });

  // Clean slate between tests.
  function reset() {
    h.fake.applyRunCreateCalls.length = 0;
    h.fake.jobFindCalls.length = 0;
    h.temporal.calls.length = 0;
    h.fake.setJobRow(null);
  }

  it("uses body-supplied jobUrl + atsType directly (no DB lookup)", async () => {
    reset();
    const res = await h.post("/api/runs", {
      jobId: "69e5557a34c1d374cead07ce",
      candidateId: "68baa89f0c71a6827377cf56",
      mode: "FULL_AUTO",
      jobUrl: "https://example.com/apply/from-body",
      atsType: "GREENHOUSE",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(h.temporal.calls.length, 1);
    assert.equal(h.temporal.calls[0]?.input.jobUrl, "https://example.com/apply/from-body");
    assert.equal(h.temporal.calls[0]?.input.atsType, "GREENHOUSE");
    // No lookup should have been necessary.
    assert.equal(h.fake.jobFindCalls.length, 0);
    assert.equal(res.body.message, "Run started and workflow triggered");
  });

  it("resolves jobUrl + atsType from job_opportunities when body omits them", async () => {
    reset();
    h.fake.setJobRow({
      jobUrl: "https://boards.greenhouse.io/grafana/jobs/1",
      atsType: "GREENHOUSE",
    });

    const res = await h.post("/api/runs", {
      jobId: "69e5557a34c1d374cead07ce",
      candidateId: "68baa89f0c71a6827377cf56",
      mode: "FULL_AUTO",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(h.fake.jobFindCalls.length, 1);
    assert.equal(h.fake.jobFindCalls[0]?.where.id, "69e5557a34c1d374cead07ce");
    assert.equal(h.temporal.calls.length, 1);
    assert.equal(h.temporal.calls[0]?.input.jobUrl, "https://boards.greenhouse.io/grafana/jobs/1");
    assert.equal(h.temporal.calls[0]?.input.atsType, "GREENHOUSE");
    assert.equal(res.body.message, "Run started and workflow triggered");
  });

  it("resolves only the missing field when body supplies one of two", async () => {
    reset();
    h.fake.setJobRow({
      jobUrl: "https://boards.greenhouse.io/grafana/jobs/1",
      atsType: "GREENHOUSE",
    });

    const res = await h.post("/api/runs", {
      jobId: "69e5557a34c1d374cead07ce",
      candidateId: "68baa89f0c71a6827377cf56",
      mode: "FULL_AUTO",
      jobUrl: "https://override-from-body/apply",
    });
    assert.equal(res.status, 201);
    assert.equal(h.temporal.calls.length, 1);
    assert.equal(h.temporal.calls[0]?.input.jobUrl, "https://override-from-body/apply");
    assert.equal(h.temporal.calls[0]?.input.atsType, "GREENHOUSE");
  });

  it("surfaces an explicit warning when no body fields AND no matching job row", async () => {
    reset();
    h.fake.setJobRow(null);

    const res = await h.post("/api/runs", {
      jobId: "nonexistent-job-id",
      candidateId: "68baa89f0c71a6827377cf56",
      mode: "FULL_AUTO",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(h.temporal.calls.length, 0);
    assert.equal(res.body.message?.toString().startsWith("Run started successfully"), true);
    assert.match(String(res.body.message), /workflow.*not.*start|job_opportunities.*not found/i);
  });
});
