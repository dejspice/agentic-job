import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { BrowserBroker, RuntimeProvider } from "../index.js";
import type { AllocatedSession } from "../index.js";
import { BrowserWorker } from "@dejsol/browser-worker";

const BRIGHT_DATA_AUTH = process.env["BRIGHT_DATA_AUTH"];
const HAS_CREDENTIALS = Boolean(BRIGHT_DATA_AUTH);

const TEST_URL = "https://example.com";
const SESSION_TIMEOUT_MS = 60_000;

describe("Browser infrastructure integration — broker + worker", { skip: !HAS_CREDENTIALS && "BRIGHT_DATA_AUTH not set — skipping integration test" }, () => {
  let broker: BrowserBroker;
  let session: AllocatedSession;
  let worker: BrowserWorker;

  before(async () => {
    broker = new BrowserBroker();
    session = await broker.allocateSession({
      provider: RuntimeProvider.BRIGHT_DATA,
      timeoutMs: SESSION_TIMEOUT_MS,
    });
    worker = new BrowserWorker(session.page);
  });

  after(async () => {
    if (session && broker) {
      await broker.releaseSession(session);
    }
  });

  it("allocates a session with a valid id", () => {
    assert.ok(session.id, "session.id should be a non-empty string");
    assert.equal(typeof session.id, "string");
  });

  it("identifies the runtime provider as bright_data", () => {
    assert.equal(session.provider, RuntimeProvider.BRIGHT_DATA);
  });

  it("provides a live Playwright page", () => {
    assert.ok(session.page, "session.page should exist");
    assert.ok(session.context, "session.context should exist");
    assert.ok(session.browser, "session.browser should exist");
  });

  it("tracks the session in the broker", () => {
    assert.equal(broker.activeSessionCount, 1);
    const retrieved = broker.getActiveSession(session.id);
    assert.ok(retrieved, "broker should track the allocated session");
    assert.equal(retrieved!.id, session.id);
  });

  it("navigates to a stable URL via worker NAVIGATE command", async () => {
    const result = await worker.execute({ type: "NAVIGATE", url: TEST_URL });
    assert.equal(result.success, true, `NAVIGATE failed: ${result.error}`);
    assert.ok(result.durationMs >= 0, "durationMs should be non-negative");
    const data = result.data as { url: string };
    assert.ok(data.url.includes("example.com"), `Unexpected URL after navigate: ${data.url}`);
  });

  it("takes a screenshot via worker SCREENSHOT command", async () => {
    const result = await worker.execute({ type: "SCREENSHOT" });
    assert.equal(result.success, true, `SCREENSHOT failed: ${result.error}`);
    assert.ok(result.durationMs >= 0, "durationMs should be non-negative");
    const data = result.data as { buffer: Buffer; byteLength: number };
    assert.ok(data.buffer, "screenshot should return a buffer");
    assert.ok(data.byteLength > 0, "screenshot buffer should be non-empty");
  });

  it("releases the session cleanly", async () => {
    await broker.releaseSession(session);
    assert.equal(broker.activeSessionCount, 0, "no active sessions after release");
    assert.equal(broker.getActiveSession(session.id), undefined, "released session should not be retrievable");
    // Prevent the after() hook from double-releasing
    session = undefined as unknown as AllocatedSession;
  });
});
