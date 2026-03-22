import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchScreeningQuestion,
  SCREENING_RULES,
  type ScreeningRule,
} from "../screening/deterministic-rules.js";
import {
  scoreOption,
  pickBestOption,
} from "../screening/option-matcher.js";
import { answerScreeningQuestionsState } from "../states/answer-screening-questions.js";
import type { StateContext } from "../types.js";
import { StateName } from "@dejsol/core";
import type { WorkerCommand, CommandResult } from "@dejsol/core";

// ---------------------------------------------------------------------------
// Helper: build a candidate data bag matching the harness structure
// ---------------------------------------------------------------------------

function candidateData(overrides: Record<string, string> = {}): Record<string, unknown> {
  return {
    candidate: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      linkedin: "https://linkedin.com/in/janedoe",
      requireSponsorship: "No",
      authorizedToWork: "Yes",
      previouslyWorkedAsRole: "Yes",
      experienceDuration: "5+ years",
      industry: "SaaS / Software",
      analyticsScope: "Defining KPIs and building analytics frameworks",
      pythonExperience: "I use Python or R regularly for data analysis",
      hasPortfolio: "Yes",
      workedHereBefore: "No",
      salaryRange: "$120,000",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Deterministic rule matching — known questions
// ---------------------------------------------------------------------------

describe("matchScreeningQuestion — known patterns", () => {
  it("matches LinkedIn Profile → dataKey candidate.linkedin", () => {
    const result = matchScreeningQuestion("LinkedIn Profile *", candidateData());
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "linkedin_profile");
      assert.equal(result.value, "https://linkedin.com/in/janedoe");
    }
  });

  it("matches visa sponsorship question", () => {
    const result = matchScreeningQuestion(
      "Do you now or in the future require visa sponsorship?",
      candidateData(),
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "visa_sponsorship");
      assert.equal(result.value, "No");
    }
  });

  it("matches 'previously worked as' question", () => {
    const result = matchScreeningQuestion(
      "Have you previously worked as a Product Data Analyst?",
      candidateData(),
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "previously_worked_as");
      assert.equal(result.value, "Yes");
    }
  });

  it("matches experience duration question", () => {
    const result = matchScreeningQuestion(
      "For how long have you previously worked as a Product Data Analyst?",
      candidateData(),
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "experience_duration");
      assert.equal(result.value, "5+ years");
    }
  });

  it("matches industry/career question", () => {
    const result = matchScreeningQuestion(
      "Which best describes the industry you've spent most of your analytics career in? *",
      candidateData(),
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "industry_career");
      assert.equal(result.value, "SaaS / Software");
    }
  });

  it("matches analytics scope question", () => {
    const result = matchScreeningQuestion(
      "Which best describes the scope of your analytics work?",
      candidateData(),
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "analytics_scope");
      assert.equal(result.value, "Defining KPIs and building analytics frameworks");
    }
  });

  it("matches Python/R experience question", () => {
    const result = matchScreeningQuestion(
      "Which best describes your experience with Python or R for data analysis?",
      candidateData(),
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "python_r_experience");
      assert.equal(result.value, "I use Python or R regularly for data analysis");
    }
  });

  it("matches portfolio/case studies question", () => {
    const result = matchScreeningQuestion(
      "Do you have a portfolio and/or case studies of your work as a Product Data Analyst that you can share during this interview process?",
      candidateData(),
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.rule.name, "portfolio_case_studies");
      assert.equal(result.value, "Yes");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Unknown question → no_match
// ---------------------------------------------------------------------------

describe("matchScreeningQuestion — unknown questions", () => {
  it("returns no_match for an unrecognized question", () => {
    const result = matchScreeningQuestion(
      "What is your favorite color?",
      candidateData(),
    );
    assert.equal(result.matched, false);
    if (!result.matched) {
      assert.equal(result.label, "What is your favorite color?");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Fallback values when data bag is missing a key
// ---------------------------------------------------------------------------

describe("matchScreeningQuestion — fallback values", () => {
  it("uses fallback when data key is absent", () => {
    const result = matchScreeningQuestion("LinkedIn Profile", { candidate: {} });
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.value, "N/A");
    }
  });

  it("uses fallback for visa sponsorship when key is missing", () => {
    const result = matchScreeningQuestion(
      "Do you require visa sponsorship?",
      { candidate: {} },
    );
    assert.equal(result.matched, true);
    if (result.matched) {
      assert.equal(result.value, "No");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Interaction type correctness
// ---------------------------------------------------------------------------

describe("rule interaction types", () => {
  it("LinkedIn is text interaction", () => {
    const rule = SCREENING_RULES.find((r) => r.name === "linkedin_profile");
    assert.equal(rule?.interaction, "text");
  });

  it("visa_sponsorship is react-select interaction", () => {
    const rule = SCREENING_RULES.find((r) => r.name === "visa_sponsorship");
    assert.equal(rule?.interaction, "react-select");
  });

  it("salary_expectation is text interaction", () => {
    const rule = SCREENING_RULES.find((r) => r.name === "salary_expectation");
    assert.equal(rule?.interaction, "text");
  });
});

// ---------------------------------------------------------------------------
// 5. State handler integration — text fill
// ---------------------------------------------------------------------------

describe("answerScreeningQuestionsState — text field fill", () => {
  it("fills a text screening question via TYPE command", async () => {
    const commands: WorkerCommand[] = [];

    const ctx: StateContext = {
      runId: "test-run",
      jobId: "test-job",
      candidateId: "test-cand",
      jobUrl: "https://example.com",
      currentState: StateName.ANSWER_SCREENING_QUESTIONS,
      stateHistory: [],
      data: candidateData(),
      execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
        commands.push(cmd);
        if (cmd.type === "EXTRACT_FIELDS") {
          return {
            success: true,
            durationMs: 0,
            data: {
              fields: [
                {
                  selector: "#question_12345",
                  label: "LinkedIn Profile *",
                  type: "text",
                  value: null,
                  required: true,
                },
              ],
              count: 1,
            },
          };
        }
        return { success: true, durationMs: 0 };
      },
    };

    const result = await answerScreeningQuestionsState.execute(ctx);

    assert.equal(result.outcome, "success");
    const typeCmd = commands.find((c) => c.type === "TYPE" && "selector" in c && (c as { selector: string }).selector === "#question_12345");
    assert.ok(typeCmd, "Expected a TYPE command targeting #question_12345");
  });
});

// ---------------------------------------------------------------------------
// 6. State handler integration — react-select dropdown fill
// ---------------------------------------------------------------------------

describe("answerScreeningQuestionsState — dropdown fill", () => {
  it("fills a dropdown question via TYPE(sequential) + EXTRACT_OPTIONS + option CLICK", async () => {
    const commands: WorkerCommand[] = [];

    const ctx: StateContext = {
      runId: "test-run",
      jobId: "test-job",
      candidateId: "test-cand",
      jobUrl: "https://example.com",
      currentState: StateName.ANSWER_SCREENING_QUESTIONS,
      stateHistory: [],
      data: candidateData(),
      execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
        commands.push(cmd);
        if (cmd.type === "EXTRACT_FIELDS") {
          return {
            success: true,
            durationMs: 0,
            data: {
              fields: [
                {
                  selector: "#question_99999",
                  label: "Do you now or in the future require visa sponsorship?",
                  type: "text",
                  value: null,
                  required: true,
                },
              ],
              count: 1,
            },
          };
        }
        if (cmd.type === "EXTRACT_OPTIONS") {
          return {
            success: true,
            durationMs: 0,
            data: { options: ["Yes", "No"], count: 2 },
          };
        }
        return { success: true, durationMs: 0 };
      },
    };

    const result = await answerScreeningQuestionsState.execute(ctx);

    assert.equal(result.outcome, "success");
    const typeCmds = commands.filter((c) => c.type === "TYPE" && "sequential" in c && (c as { sequential?: boolean }).sequential);
    assert.ok(typeCmds.length >= 1, "Expected at least 1 sequential TYPE command (scroll+click+type)");
    const extractCmds = commands.filter((c) => c.type === "EXTRACT_OPTIONS");
    assert.ok(extractCmds.length >= 1, "Expected EXTRACT_OPTIONS command");
    const clickCmds = commands.filter((c) => c.type === "CLICK");
    assert.ok(clickCmds.length >= 1, "Expected at least 1 CLICK command (select option)");
  });
});

// ---------------------------------------------------------------------------
// 7. Unknown questions are skipped, not failed
// ---------------------------------------------------------------------------

describe("answerScreeningQuestionsState — unknown question handling", () => {
  it("skips unknown questions and reports them in screeningSkipped", async () => {
    const ctx: StateContext = {
      runId: "test-run",
      jobId: "test-job",
      candidateId: "test-cand",
      jobUrl: "https://example.com",
      currentState: StateName.ANSWER_SCREENING_QUESTIONS,
      stateHistory: [],
      data: candidateData(),
      execute: async (cmd: WorkerCommand): Promise<CommandResult> => {
        if (cmd.type === "EXTRACT_FIELDS") {
          return {
            success: true,
            durationMs: 0,
            data: {
              fields: [
                {
                  selector: "#question_00001",
                  label: "What is your spirit animal?",
                  type: "text",
                  value: null,
                  required: true,
                },
              ],
              count: 1,
            },
          };
        }
        return { success: true, durationMs: 0 };
      },
    };

    const result = await answerScreeningQuestionsState.execute(ctx);

    assert.equal(result.outcome, "success");
    const skipped = (result.data as Record<string, unknown>)?.screeningSkipped as string[];
    assert.ok(skipped?.includes("What is your spirit animal?"), "Unknown question should be in screeningSkipped");
  });
});

// ===========================================================================
// Option Matcher tests
// ===========================================================================

// ---------------------------------------------------------------------------
// 8. scoreOption — exact match
// ---------------------------------------------------------------------------

describe("scoreOption — exact match", () => {
  it("returns 100 for exact case-insensitive match", () => {
    assert.equal(scoreOption("Yes", "Yes"), 100);
    assert.equal(scoreOption("yes", "Yes"), 100);
    assert.equal(scoreOption("No", "no"), 100);
  });

  it("returns 100 with collapsed whitespace", () => {
    assert.equal(scoreOption("3-5 years", "3-5  years"), 100);
  });
});

// ---------------------------------------------------------------------------
// 9. scoreOption — alias match
// ---------------------------------------------------------------------------

describe("scoreOption — alias match", () => {
  it("matches '3-5 years' to '3 to 5 years' via alias", () => {
    const score = scoreOption("3-5 years", "3 to 5 years");
    assert.equal(score, 90);
  });

  it("matches 'Technology' to 'Software / SaaS' via alias", () => {
    const score = scoreOption("Technology", "Software / SaaS");
    assert.ok(score >= 90, `Expected >= 90, got ${score}`);
  });

  it("matches 'Advanced' to 'Advanced / expert' via alias", () => {
    const score = scoreOption("Advanced", "Advanced / expert");
    assert.ok(score >= 80, `Expected >= 80, got ${score}`);
  });

  it("matches 'Company-wide' to 'Company wide' via alias", () => {
    const score = scoreOption("Company-wide", "Company wide");
    assert.ok(score >= 90, `Expected >= 90, got ${score}`);
  });

  it("matches 'Yes' to 'Yes, I do' via alias", () => {
    const score = scoreOption("Yes", "Yes, I do");
    assert.ok(score >= 70, `Expected >= 70, got ${score}`);
  });

  it("matches 'No' to 'No, I don't' via alias", () => {
    const score = scoreOption("No", "No, I don't");
    assert.ok(score >= 70, `Expected >= 70, got ${score}`);
  });
});

// ---------------------------------------------------------------------------
// 10. scoreOption — starts-with and contains
// ---------------------------------------------------------------------------

describe("scoreOption — partial match", () => {
  it("scores starts-with at 80", () => {
    assert.equal(scoreOption("Advanced", "Advanced proficiency in Python"), 80);
  });

  it("scores contains at 70", () => {
    assert.equal(scoreOption("Technology", "The Technology Industry"), 70);
  });
});

// ---------------------------------------------------------------------------
// 11. pickBestOption — selection from a list
// ---------------------------------------------------------------------------

describe("pickBestOption — multi-option selection", () => {
  it("picks exact match over partial matches", () => {
    const result = pickBestOption("Yes", ["No", "Yes", "Maybe"]);
    assert.ok(result);
    assert.equal(result.label, "Yes");
    assert.equal(result.index, 1);
    assert.equal(result.score, 100);
  });

  it("picks alias match when exact is absent", () => {
    const result = pickBestOption("3-5 years", [
      "Less than 1 year",
      "1 to 2 years",
      "3 to 5 years",
      "5 to 10 years",
      "10 or more years",
    ]);
    assert.ok(result);
    assert.equal(result.label, "3 to 5 years");
    assert.equal(result.index, 2);
  });

  it("picks best match for 'Technology' against real-ish options", () => {
    const result = pickBestOption("Technology", [
      "Healthcare / Life Sciences",
      "Financial Services / Fintech",
      "Technology / Software",
      "E-commerce / Retail",
      "Other",
    ]);
    assert.ok(result);
    assert.equal(result.index, 2);
  });

  it("picks best match for 'Advanced' against proficiency options", () => {
    const result = pickBestOption("Advanced", [
      "Beginner / Learning",
      "Intermediate / Proficient",
      "Advanced / Expert",
    ]);
    assert.ok(result);
    assert.equal(result.index, 2);
  });

  // ── Real Celigo/Greenhouse live option labels ──────────────────────

  it("picks '5+ years' against real Celigo duration options", () => {
    const result = pickBestOption("5+ years", [
      "Less than a year",
      "1-3 years",
      "3-5 years",
      "5-10 years",
      "10+ years",
    ]);
    assert.ok(result, "Expected a match for '5+ years'");
    assert.ok(
      result.label === "5-10 years" || result.label === "10+ years",
      `Expected 5-10 or 10+ years, got: ${result.label}`,
    );
  });

  it("picks 'SaaS / Software' against real Celigo industry options", () => {
    const result = pickBestOption("SaaS / Software", [
      "Consumer / B2C (e-commerce, media, mobile apps)",
      "B2B (enterprise software, SaaS)",
      "Healthcare / Life Sciences",
      "Financial Services / Fintech",
      "Other",
    ]);
    assert.ok(result, "Expected a match for SaaS industry");
    assert.equal(result.index, 1, `Expected B2B SaaS option, got: ${result.label}`);
  });

  it("picks analytics-framework scope against real Celigo scope options", () => {
    const result = pickBestOption(
      "Defining KPIs and building analytics frameworks",
      [
        "Maintaining existing reports and dashboards",
        "Answering ad-hoc questions from stakeholders",
        "Defining KPIs and building analytics frameworks",
        "Leading an analytics team or function",
      ],
    );
    assert.ok(result, "Expected exact match for analytics-frameworks scope");
    assert.equal(result.index, 2);
    assert.equal(result.score, 100);
  });

  it("picks Python/R proficiency against real Celigo options", () => {
    const result = pickBestOption(
      "I use Python or R regularly for data analysis",
      [
        "I work in spreadsheets and BI tools",
        "I've written some scripts or queries but I'm still learning",
        "I use Python or R regularly for data analysis",
        "I build production-grade data pipelines and models",
      ],
    );
    assert.ok(result, "Expected exact match for Python/R proficiency");
    assert.equal(result.index, 2);
    assert.equal(result.score, 100);
  });

  it("picks 'No' for visa sponsorship — not 'Yes'", () => {
    const result = pickBestOption("No", ["Yes", "No"]);
    assert.ok(result);
    assert.equal(result.label, "No");
    assert.equal(result.index, 1);
  });

  it("returns null when no option matches", () => {
    const result = pickBestOption("Quantum Computing", [
      "Healthcare",
      "Finance",
      "Retail",
    ]);
    assert.equal(result, null);
  });

  it("returns null for empty option list", () => {
    const result = pickBestOption("Yes", []);
    assert.equal(result, null);
  });
});
