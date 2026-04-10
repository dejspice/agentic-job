/**
 * Unit tests for answer bank persistence: loadAnswerBank, persistAnswerBank.
 *
 * Validates:
 *   1. loadAnswerBank returns {} for unknown candidates
 *   2. loadAnswerBank returns stored bank data
 *   3. persistAnswerBank merges new entries with existing bank
 *   4. persistAnswerBank preserves unrelated entries
 *   5. Learning loop: answers from run 1 are reusable in run 2
 *
 * No real database — uses mock PrismaClient.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import type { PrismaClient } from "@prisma/client";
import type { AnswerBank } from "@dejsol/core";
import { loadAnswerBank, persistAnswerBank } from "../persistence.js";

// ---------------------------------------------------------------------------
// Mock PrismaClient with in-memory candidate store
// ---------------------------------------------------------------------------

interface MockCandidate {
  id: string;
  answerBankJson: AnswerBank;
}

function makeMockPrisma(initialCandidates: MockCandidate[] = []): {
  prisma: PrismaClient;
  store: Map<string, MockCandidate>;
} {
  const store = new Map<string, MockCandidate>();
  for (const c of initialCandidates) {
    store.set(c.id, { ...c, answerBankJson: { ...c.answerBankJson } });
  }

  const prisma = {
    candidate: {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        return store.get(args.where.id) ?? null;
      },
      update: async (args: { where: { id: string }; data: { answerBankJson: unknown } }) => {
        const existing = store.get(args.where.id);
        if (!existing) throw new Error(`Candidate ${args.where.id} not found`);
        existing.answerBankJson = args.data.answerBankJson as AnswerBank;
        return existing;
      },
    },
  } as unknown as PrismaClient;

  return { prisma, store };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const CANDIDATE_ID = "cand-test-001";

describe("loadAnswerBank", () => {
  it("returns {} for an unknown candidate", async () => {
    const { prisma } = makeMockPrisma([]);
    const bank = await loadAnswerBank("nonexistent", prisma);
    assert.deepEqual(bank, {});
  });

  it("returns {} for a candidate with empty bank", async () => {
    const { prisma } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: {} }]);
    const bank = await loadAnswerBank(CANDIDATE_ID, prisma);
    assert.deepEqual(bank, {});
  });

  it("returns stored bank entries", async () => {
    const existingBank: AnswerBank = {
      "linkedin profile": {
        question: "LinkedIn Profile",
        answer: "https://linkedin.com/in/janedoe",
        source: "rule",
        confidence: 1.0,
        lastUsed: "2026-01-01T00:00:00.000Z",
      },
    };
    const { prisma } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: existingBank }]);
    const bank = await loadAnswerBank(CANDIDATE_ID, prisma);
    assert.equal(Object.keys(bank).length, 1);
    assert.equal(bank["linkedin profile"]?.answer, "https://linkedin.com/in/janedoe");
  });
});

describe("persistAnswerBank", () => {
  it("writes new entries to an empty bank", async () => {
    const { prisma, store } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: {} }]);
    const newEntries: AnswerBank = {
      "do you require visa sponsorship": {
        question: "Do you require visa sponsorship?",
        answer: "No",
        source: "rule",
        confidence: 1.0,
        lastUsed: "2026-04-06T00:00:00.000Z",
      },
    };
    const merged = await persistAnswerBank(CANDIDATE_ID, newEntries, prisma);
    assert.equal(Object.keys(merged).length, 1);
    assert.equal(merged["do you require visa sponsorship"]?.answer, "No");
    assert.deepEqual(store.get(CANDIDATE_ID)?.answerBankJson, merged);
  });

  it("merges new entries with existing bank, preserving old entries", async () => {
    const existingBank: AnswerBank = {
      "linkedin profile": {
        question: "LinkedIn Profile",
        answer: "https://linkedin.com/in/janedoe",
        source: "rule",
        confidence: 1.0,
        lastUsed: "2026-01-01T00:00:00.000Z",
      },
    };
    const { prisma, store } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: existingBank }]);

    const newEntries: AnswerBank = {
      "salary expectations": {
        question: "What are your salary expectations?",
        answer: "$120,000 - $140,000",
        source: "rule",
        confidence: 1.0,
        lastUsed: "2026-04-06T00:00:00.000Z",
      },
    };

    const merged = await persistAnswerBank(CANDIDATE_ID, newEntries, prisma);
    assert.equal(Object.keys(merged).length, 2);
    assert.equal(merged["linkedin profile"]?.answer, "https://linkedin.com/in/janedoe");
    assert.equal(merged["salary expectations"]?.answer, "$120,000 - $140,000");
    assert.deepEqual(store.get(CANDIDATE_ID)?.answerBankJson, merged);
  });

  it("overwrites existing entry when same key is provided", async () => {
    const existingBank: AnswerBank = {
      "salary expectations": {
        question: "What are your salary expectations?",
        answer: "$100,000",
        source: "generated",
        confidence: 0.8,
        lastUsed: "2026-01-01T00:00:00.000Z",
      },
    };
    const { prisma } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: existingBank }]);

    const newEntries: AnswerBank = {
      "salary expectations": {
        question: "What are your salary expectations?",
        answer: "$120,000 - $140,000",
        source: "rule",
        confidence: 1.0,
        lastUsed: "2026-04-06T00:00:00.000Z",
      },
    };

    const merged = await persistAnswerBank(CANDIDATE_ID, newEntries, prisma);
    assert.equal(merged["salary expectations"]?.answer, "$120,000 - $140,000");
    assert.equal(merged["salary expectations"]?.source, "rule");
  });

  it("is idempotent — second call with same entries produces same result", async () => {
    const { prisma } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: {} }]);
    const entries: AnswerBank = {
      "test question": {
        question: "Test question?",
        answer: "Test answer",
        source: "rule",
        confidence: 1.0,
        lastUsed: "2026-04-06T00:00:00.000Z",
      },
    };

    const first = await persistAnswerBank(CANDIDATE_ID, entries, prisma);
    const second = await persistAnswerBank(CANDIDATE_ID, entries, prisma);
    assert.deepEqual(first, second);
  });
});

describe("answer bank learning loop", () => {
  it("answers persisted after run 1 are loadable before run 2", async () => {
    const { prisma } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: {} }]);

    // Run 1: screening produces answers, harness merges into bank
    const run1Answers: AnswerBank = {
      "do you require visa sponsorship": {
        question: "Do you require visa sponsorship?",
        answer: "No",
        source: "rule",
        confidence: 1.0,
        lastUsed: "2026-04-06T10:00:00.000Z",
      },
      "describe your ml experience": {
        question: "Describe your ML experience",
        answer: "8 years of applied ML in production SaaS environments.",
        source: "generated",
        confidence: 0.85,
        lastUsed: "2026-04-06T10:00:00.000Z",
      },
    };

    await persistAnswerBank(CANDIDATE_ID, run1Answers, prisma);

    // Run 2: load bank before starting screening
    const bankForRun2 = await loadAnswerBank(CANDIDATE_ID, prisma);

    assert.equal(Object.keys(bankForRun2).length, 2);
    assert.equal(bankForRun2["do you require visa sponsorship"]?.answer, "No");
    assert.equal(
      bankForRun2["describe your ml experience"]?.answer,
      "8 years of applied ML in production SaaS environments.",
    );
    assert.equal(bankForRun2["describe your ml experience"]?.source, "generated");
  });

  it("run 2 answers merge with run 1 answers without losing data", async () => {
    const { prisma } = makeMockPrisma([{ id: CANDIDATE_ID, answerBankJson: {} }]);

    // Run 1 answers
    const run1: AnswerBank = {
      "question a": { question: "Question A?", answer: "Answer A", source: "rule", confidence: 1.0, lastUsed: "2026-04-06T10:00:00.000Z" },
      "question b": { question: "Question B?", answer: "Answer B", source: "generated", confidence: 0.8, lastUsed: "2026-04-06T10:00:00.000Z" },
    };
    await persistAnswerBank(CANDIDATE_ID, run1, prisma);

    // Run 2 produces answer for a new question C and updates B
    const run2: AnswerBank = {
      "question b": { question: "Question B?", answer: "Better Answer B", source: "rule", confidence: 1.0, lastUsed: "2026-04-06T11:00:00.000Z" },
      "question c": { question: "Question C?", answer: "Answer C", source: "generated", confidence: 0.9, lastUsed: "2026-04-06T11:00:00.000Z" },
    };
    const merged = await persistAnswerBank(CANDIDATE_ID, run2, prisma);

    assert.equal(Object.keys(merged).length, 3);
    assert.equal(merged["question a"]?.answer, "Answer A");
    assert.equal(merged["question b"]?.answer, "Better Answer B");
    assert.equal(merged["question c"]?.answer, "Answer C");

    // Verify the persisted state matches
    const reloaded = await loadAnswerBank(CANDIDATE_ID, prisma);
    assert.deepEqual(reloaded, merged);
  });
});
