/**
 * Greenhouse Live-Target Harness — skip-behaviour and config-loader tests
 *
 * These tests run without a real browser or live credentials.
 * They validate:
 *   1. loadHarnessConfig() returns null and the harness skips cleanly when
 *      GREENHOUSE_TARGET_URL is absent.
 *   2. loadHarnessConfig() returns a valid HarnessConfig when all required
 *      env vars are set.
 *   3. loadHarnessConfig() throws a descriptive error when GREENHOUSE_TARGET_URL
 *      is set but other required fields are missing.
 *   4. Provider mapping is correct for all supported BROWSER_PROVIDER values.
 *
 * These tests do NOT import `main()` and do NOT invoke runLiveHarness() —
 * they only exercise the config-loading layer.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { loadHarnessConfig } from "../../harness/greenhouse-live-harness.js";
import { RuntimeProvider } from "@dejsol/browser-broker";

// ---------------------------------------------------------------------------
// Env-var isolation helpers
// ---------------------------------------------------------------------------

const HARNESS_ENV_VARS = [
  "GREENHOUSE_TARGET_URL",
  "GREENHOUSE_RESUME_PATH",
  "GREENHOUSE_FIRST_NAME",
  "GREENHOUSE_LAST_NAME",
  "GREENHOUSE_EMAIL",
  "GREENHOUSE_PHONE",
  "BROWSER_PROVIDER",
  "BROWSER_HEADLESS",
  "GREENHOUSE_ARTIFACT_DIR",
  "GREENHOUSE_RUN_ID",
] as const;

type HarnessEnvKey = (typeof HARNESS_ENV_VARS)[number];

let savedEnv: Partial<Record<HarnessEnvKey, string | undefined>> = {};

function saveEnv(): void {
  for (const key of HARNESS_ENV_VARS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv(): void {
  for (const key of HARNESS_ENV_VARS) {
    const saved = savedEnv[key];
    if (saved === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved;
    }
  }
  savedEnv = {};
}

function clearHarnessEnv(): void {
  for (const key of HARNESS_ENV_VARS) {
    delete process.env[key];
  }
}

function setMinimalEnv(): void {
  process.env["GREENHOUSE_TARGET_URL"] = "https://boards.greenhouse.io/test/jobs/99999";
  process.env["GREENHOUSE_RESUME_PATH"] = "/tmp/test-resume.txt";
  process.env["GREENHOUSE_FIRST_NAME"] = "Jane";
  process.env["GREENHOUSE_LAST_NAME"] = "Doe";
  process.env["GREENHOUSE_EMAIL"] = "jane@example.com";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadHarnessConfig — skip behaviour", () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it("returns null when GREENHOUSE_TARGET_URL is not set", () => {
    clearHarnessEnv();
    const config = loadHarnessConfig();
    assert.equal(config, null);
  });

  it("returns null when GREENHOUSE_TARGET_URL is an empty string", () => {
    clearHarnessEnv();
    process.env["GREENHOUSE_TARGET_URL"] = "";
    const config = loadHarnessConfig();
    assert.equal(config, null);
  });

  it("returns null when GREENHOUSE_TARGET_URL is whitespace only", () => {
    clearHarnessEnv();
    process.env["GREENHOUSE_TARGET_URL"] = "   ";
    const config = loadHarnessConfig();
    assert.equal(config, null);
  });
});

describe("loadHarnessConfig — valid configuration", () => {
  beforeEach(() => {
    saveEnv();
    clearHarnessEnv();
  });
  afterEach(restoreEnv);

  it("returns a valid HarnessConfig when all required vars are set", () => {
    setMinimalEnv();
    const config = loadHarnessConfig();

    assert.ok(config !== null, "Expected config to be non-null");
    assert.equal(config.targetUrl, "https://boards.greenhouse.io/test/jobs/99999");
    assert.equal(config.candidate.firstName, "Jane");
    assert.equal(config.candidate.lastName, "Doe");
    assert.equal(config.candidate.email, "jane@example.com");
    assert.equal(config.candidate.phone, undefined);
    assert.ok(typeof config.runId === "string" && config.runId.length > 0);
    assert.ok(typeof config.artifactDir === "string" && config.artifactDir.length > 0);
  });

  it("includes phone when GREENHOUSE_PHONE is set", () => {
    setMinimalEnv();
    process.env["GREENHOUSE_PHONE"] = "(555) 123-4567";
    const config = loadHarnessConfig();
    assert.equal(config?.candidate.phone, "(555) 123-4567");
  });

  it("defaults provider to LOCAL when BROWSER_PROVIDER is not set", () => {
    setMinimalEnv();
    delete process.env["BROWSER_PROVIDER"];
    const config = loadHarnessConfig();
    assert.equal(config?.provider, RuntimeProvider.LOCAL);
  });

  it("maps BROWSER_PROVIDER=local to RuntimeProvider.LOCAL", () => {
    setMinimalEnv();
    process.env["BROWSER_PROVIDER"] = "local";
    const config = loadHarnessConfig();
    assert.equal(config?.provider, RuntimeProvider.LOCAL);
  });

  it("maps BROWSER_PROVIDER=bright_data to RuntimeProvider.BRIGHT_DATA", () => {
    setMinimalEnv();
    process.env["BROWSER_PROVIDER"] = "bright_data";
    const config = loadHarnessConfig();
    assert.equal(config?.provider, RuntimeProvider.BRIGHT_DATA);
  });

  it("maps BROWSER_PROVIDER=browserbase to RuntimeProvider.BROWSERBASE", () => {
    setMinimalEnv();
    process.env["BROWSER_PROVIDER"] = "browserbase";
    const config = loadHarnessConfig();
    assert.equal(config?.provider, RuntimeProvider.BROWSERBASE);
  });

  it("defaults headless to true", () => {
    setMinimalEnv();
    delete process.env["BROWSER_HEADLESS"];
    const config = loadHarnessConfig();
    assert.equal(config?.headless, true);
  });

  it("sets headless to false when BROWSER_HEADLESS=false", () => {
    setMinimalEnv();
    process.env["BROWSER_HEADLESS"] = "false";
    const config = loadHarnessConfig();
    assert.equal(config?.headless, false);
  });

  it("honours GREENHOUSE_RUN_ID when set", () => {
    setMinimalEnv();
    process.env["GREENHOUSE_RUN_ID"] = "my-custom-run-id";
    const config = loadHarnessConfig();
    assert.equal(config?.runId, "my-custom-run-id");
  });

  it("honours GREENHOUSE_ARTIFACT_DIR when set", () => {
    setMinimalEnv();
    process.env["GREENHOUSE_ARTIFACT_DIR"] = "/tmp/my-artifacts";
    const config = loadHarnessConfig();
    assert.equal(config?.artifactDir, "/tmp/my-artifacts");
  });
});

describe("loadHarnessConfig — validation errors", () => {
  beforeEach(() => {
    saveEnv();
    clearHarnessEnv();
  });
  afterEach(restoreEnv);

  it("throws when GREENHOUSE_TARGET_URL is set but GREENHOUSE_RESUME_PATH is missing", () => {
    process.env["GREENHOUSE_TARGET_URL"] = "https://boards.greenhouse.io/test/jobs/1";
    process.env["GREENHOUSE_FIRST_NAME"] = "Jane";
    process.env["GREENHOUSE_LAST_NAME"] = "Doe";
    process.env["GREENHOUSE_EMAIL"] = "jane@example.com";
    // GREENHOUSE_RESUME_PATH intentionally absent

    assert.throws(
      () => loadHarnessConfig(),
      /GREENHOUSE_RESUME_PATH/,
      "Expected error mentioning GREENHOUSE_RESUME_PATH",
    );
  });

  it("throws when multiple required vars are missing — lists all of them", () => {
    process.env["GREENHOUSE_TARGET_URL"] = "https://boards.greenhouse.io/test/jobs/1";
    // All other required vars absent

    assert.throws(
      () => loadHarnessConfig(),
      (err: unknown) => {
        const msg = (err as Error).message;
        return (
          msg.includes("GREENHOUSE_RESUME_PATH") &&
          msg.includes("GREENHOUSE_FIRST_NAME") &&
          msg.includes("GREENHOUSE_LAST_NAME") &&
          msg.includes("GREENHOUSE_EMAIL")
        );
      },
      "Expected error listing all missing vars",
    );
  });

  it("throws when BROWSER_PROVIDER is an unknown value", () => {
    setMinimalEnv();
    process.env["BROWSER_PROVIDER"] = "unknown_provider";

    assert.throws(
      () => loadHarnessConfig(),
      /unknown_provider/,
      "Expected error mentioning the unknown provider value",
    );
  });
});
