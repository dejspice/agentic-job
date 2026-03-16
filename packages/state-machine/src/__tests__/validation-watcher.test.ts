import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  scanPageForValidationIssues,
  type PageValidationSignal,
  type ValidationIssueCategory,
  type ValidationIssueSeverity,
} from "../validation-watcher.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

const empty: PageValidationSignal = { visibleText: [] };

function scan(partial: Partial<PageValidationSignal>) {
  return scanPageForValidationIssues({ visibleText: [], ...partial });
}

function hasCategory(result: ReturnType<typeof scanPageForValidationIssues>, cat: ValidationIssueCategory) {
  return result.issues.some((i) => i.category === cat);
}

function findCategory(result: ReturnType<typeof scanPageForValidationIssues>, cat: ValidationIssueCategory) {
  return result.issues.find((i) => i.category === cat);
}

// ─── Clean page ───────────────────────────────────────────────────────────

describe("scanPageForValidationIssues — clean page", () => {
  it("returns zero issues for an empty signal", () => {
    const r = scanPageForValidationIssues(empty);
    assert.equal(r.issues.length, 0);
    assert.equal(r.blocking, false);
    assert.equal(r.errorCount, 0);
    assert.equal(r.warningCount, 0);
    assert.equal(r.requiredFieldCount, 0);
    assert.equal(r.summary, "No validation issues detected.");
  });

  it("returns zero issues for page text that contains no error patterns", () => {
    const r = scan({
      visibleText: ["First name", "Last name", "Email address", "Phone number", "Submit"],
    });
    assert.equal(r.issues.length, 0);
    assert.equal(r.blocking, false);
  });
});

// ─── Required fields ──────────────────────────────────────────────────────

describe("scanPageForValidationIssues — REQUIRED_FIELD_EMPTY (text patterns)", () => {
  const blockingCases: Array<{ text: string; label: string }> = [
    { text: "This field is required", label: "standard message" },
    { text: "field is required", label: "partial phrase" },
    { text: "First name is required", label: "field name + is required" },
    { text: "Email is required.", label: "trailing punctuation" },
  ];

  for (const { text, label } of blockingCases) {
    it(`detects REQUIRED_FIELD_EMPTY (BLOCKING) — ${label}`, () => {
      const r = scan({ visibleText: [text] });
      const issue = findCategory(r, "REQUIRED_FIELD_EMPTY");
      assert.ok(issue, `Expected REQUIRED_FIELD_EMPTY for: "${text}"`);
      assert.equal(issue.severity, "BLOCKING");
      assert.equal(r.blocking, true);
    });
  }

  it('detects REQUIRED_FIELD_EMPTY (WARNING) for "please fill in this field"', () => {
    const r = scan({ visibleText: ["Please fill in this field"] });
    const issue = findCategory(r, "REQUIRED_FIELD_EMPTY");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
  });
});

describe("scanPageForValidationIssues — REQUIRED_FIELD_EMPTY (structural selectors)", () => {
  it("creates one REQUIRED_FIELD_EMPTY issue per requiredEmptySelector", () => {
    const r = scan({
      requiredEmptySelectors: ["#first-name", "#last-name", "#email"],
    });
    const structural = r.issues.filter(
      (i) => i.category === "REQUIRED_FIELD_EMPTY" && i.fieldSelector !== undefined,
    );
    assert.equal(structural.length, 3);
    assert.equal(r.blocking, true);
  });

  it("fieldSelector is preserved on structural issues", () => {
    const r = scan({ requiredEmptySelectors: ["#phone"] });
    const issue = r.issues.find((i) => i.fieldSelector === "#phone");
    assert.ok(issue);
    assert.equal(issue.category, "REQUIRED_FIELD_EMPTY");
  });

  it("requiredFieldCount reflects required-empty selectors", () => {
    const r = scan({ requiredEmptySelectors: ["#a", "#b"] });
    assert.equal(r.requiredFieldCount, 2);
  });
});

// ─── Invalid format ───────────────────────────────────────────────────────

describe("scanPageForValidationIssues — INVALID_FORMAT", () => {
  const blockingCases = [
    "Invalid email address",
    "Invalid email",
    "Invalid phone number",
    "Enter a valid email",
    "Enter a valid phone",
    "Enter a valid date",
    "Must be a valid format",
  ];

  for (const text of blockingCases) {
    it(`detects INVALID_FORMAT (BLOCKING) — "${text}"`, () => {
      const r = scan({ visibleText: [text] });
      assert.ok(hasCategory(r, "INVALID_FORMAT"), `Expected INVALID_FORMAT for: "${text}"`);
      assert.equal(r.blocking, true);
    });
  }

  const warningCases = [
    "Incorrect format",
    "Incorrect value",
    "Format is invalid",
    "Format is incorrect",
  ];

  for (const text of warningCases) {
    it(`detects INVALID_FORMAT (WARNING) — "${text}"`, () => {
      const r = scan({ visibleText: [text] });
      const issue = findCategory(r, "INVALID_FORMAT");
      assert.ok(issue, `Expected INVALID_FORMAT for: "${text}"`);
      assert.equal(issue.severity, "WARNING");
      assert.equal(r.blocking, false);
    });
  }
});

// ─── Upload issues ────────────────────────────────────────────────────────

describe("scanPageForValidationIssues — UPLOAD_FAILED", () => {
  const blockingCases = [
    "Upload failed",
    "Upload error",
    "Could not parse your resume",
    "Could not process the document",
    "File type is not supported",
    "File size is too large",
    "File is too small",
  ];

  for (const text of blockingCases) {
    it(`detects UPLOAD_FAILED (BLOCKING) — "${text}"`, () => {
      const r = scan({ visibleText: [text] });
      assert.ok(hasCategory(r, "UPLOAD_FAILED"), `Expected UPLOAD_FAILED for: "${text}"`);
      assert.equal(r.blocking, true);
    });
  }

  it('detects UPLOAD_FAILED (WARNING) for "parsing failed"', () => {
    const r = scan({ visibleText: ["Parsing failed"] });
    const issue = findCategory(r, "UPLOAD_FAILED");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
  });
});

describe("scanPageForValidationIssues — UPLOAD_MISSING", () => {
  it('detects UPLOAD_MISSING (BLOCKING) for "No resume uploaded"', () => {
    const r = scan({ visibleText: ["No resume uploaded"] });
    assert.ok(hasCategory(r, "UPLOAD_MISSING"));
    assert.equal(r.blocking, true);
  });

  it('detects UPLOAD_MISSING (BLOCKING) for "No file selected"', () => {
    const r = scan({ visibleText: ["No file selected"] });
    assert.ok(hasCategory(r, "UPLOAD_MISSING"));
  });

  it('detects UPLOAD_MISSING (WARNING) for "Please upload your resume"', () => {
    const r = scan({ visibleText: ["Please upload your resume"] });
    const issue = findCategory(r, "UPLOAD_MISSING");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
    assert.equal(r.blocking, false);
  });
});

// ─── Duplicate application ────────────────────────────────────────────────

describe("scanPageForValidationIssues — DUPLICATE_APPLICATION", () => {
  const cases = [
    "Already applied",
    "You have already applied",
    "You already submitted an application",
    "Application already exists",
    "Application already on file",
    "Duplicate application",
  ];

  for (const text of cases) {
    it(`detects DUPLICATE_APPLICATION (BLOCKING) — "${text}"`, () => {
      const r = scan({ visibleText: [text] });
      assert.ok(
        hasCategory(r, "DUPLICATE_APPLICATION"),
        `Expected DUPLICATE_APPLICATION for: "${text}"`,
      );
      assert.equal(r.blocking, true);
    });
  }
});

// ─── CAPTCHA / verification ───────────────────────────────────────────────

describe("scanPageForValidationIssues — CAPTCHA_REQUIRED", () => {
  const blockingCases = [
    "Please complete the captcha",
    "Captcha required",
    "Verification required",
    "Verification needed",
  ];

  for (const text of blockingCases) {
    it(`detects CAPTCHA_REQUIRED (BLOCKING) — "${text}"`, () => {
      const r = scan({ visibleText: [text] });
      assert.ok(hasCategory(r, "CAPTCHA_REQUIRED"), `Expected CAPTCHA_REQUIRED for: "${text}"`);
      assert.equal(r.blocking, true);
    });
  }

  it('detects CAPTCHA_REQUIRED (WARNING) for "Security check"', () => {
    const r = scan({ visibleText: ["Security check"] });
    const issue = findCategory(r, "CAPTCHA_REQUIRED");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
    assert.equal(r.blocking, false);
  });
});

// ─── Legal disclosures ────────────────────────────────────────────────────

describe("scanPageForValidationIssues — DISCLOSURE_MISSING", () => {
  it('detects DISCLOSURE_MISSING (BLOCKING) for "must accept the terms"', () => {
    const r = scan({ visibleText: ["You must accept the terms of service"] });
    const issue = findCategory(r, "DISCLOSURE_MISSING");
    assert.ok(issue);
    assert.equal(issue.severity, "BLOCKING");
    assert.equal(r.blocking, true);
  });

  it('detects DISCLOSURE_MISSING (BLOCKING) for "must acknowledge the agreement"', () => {
    const r = scan({ visibleText: ["You must acknowledge the agreement"] });
    assert.ok(hasCategory(r, "DISCLOSURE_MISSING"));
  });

  it('detects DISCLOSURE_MISSING (WARNING) for "please acknowledge the disclosure"', () => {
    const r = scan({ visibleText: ["Please acknowledge the disclosure"] });
    const issue = findCategory(r, "DISCLOSURE_MISSING");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
    assert.equal(r.blocking, false);
  });

  it('detects DISCLOSURE_MISSING (WARNING) for "please accept the consent"', () => {
    const r = scan({ visibleText: ["Please accept the consent"] });
    const issue = findCategory(r, "DISCLOSURE_MISSING");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
  });
});

// ─── Submit-blocking errors ───────────────────────────────────────────────

describe("scanPageForValidationIssues — SUBMIT_BLOCKED", () => {
  const blockingCases = [
    "Unable to submit",
    "Submission failed",
    "Submission error",
    "Fix the errors before you submit",
    "Correct the issues before proceeding",
    "Errors found on the form",
    "Issues detected on this page",
  ];

  for (const text of blockingCases) {
    it(`detects SUBMIT_BLOCKED (BLOCKING) — "${text}"`, () => {
      const r = scan({ visibleText: [text] });
      assert.ok(hasCategory(r, "SUBMIT_BLOCKED"), `Expected SUBMIT_BLOCKED for: "${text}"`);
      assert.equal(r.blocking, true);
    });
  }

  it('detects SUBMIT_BLOCKED (WARNING) for "please fix the errors"', () => {
    const r = scan({ visibleText: ["Please fix the errors"] });
    const issue = findCategory(r, "SUBMIT_BLOCKED");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
  });

  it("detects SUBMIT_BLOCKED from a toast message", () => {
    const r = scan({
      visibleText: [],
      toastMessages: ["Unable to submit. Please review the form."],
    });
    assert.ok(hasCategory(r, "SUBMIT_BLOCKED"));
    assert.equal(r.blocking, true);
  });

  it("toast messages are scanned independently of visibleText", () => {
    const fromText = scan({ visibleText: ["Submission failed"] });
    const fromToast = scan({ toastMessages: ["Submission failed"] });
    assert.equal(fromText.blocking, fromToast.blocking);
    assert.equal(fromText.issues[0]?.category, fromToast.issues[0]?.category);
  });
});

// ─── ARIA-invalid selectors ───────────────────────────────────────────────

describe("scanPageForValidationIssues — ARIA_INVALID", () => {
  it("creates one ARIA_INVALID issue per ariaInvalidSelector", () => {
    const r = scan({ ariaInvalidSelectors: ["#email", "#phone"] });
    const ariaIssues = r.issues.filter((i) => i.category === "ARIA_INVALID");
    assert.equal(ariaIssues.length, 2);
  });

  it("ARIA_INVALID issues carry fieldSelector", () => {
    const r = scan({ ariaInvalidSelectors: ["#email-input"] });
    const issue = r.issues.find((i) => i.fieldSelector === "#email-input");
    assert.ok(issue);
    assert.equal(issue.category, "ARIA_INVALID");
  });

  it("ARIA_INVALID issues are BLOCKING", () => {
    const r = scan({ ariaInvalidSelectors: ["#name"] });
    assert.equal(r.blocking, true);
    assert.ok(r.issues.every((i) => i.severity === "BLOCKING"));
  });

  it("ARIA_INVALID selectors contribute to requiredFieldCount", () => {
    const r = scan({ ariaInvalidSelectors: ["#a", "#b", "#c"] });
    assert.equal(r.requiredFieldCount, 3);
  });

  it("combined aria-invalid + required-empty count accumulates in requiredFieldCount", () => {
    const r = scan({
      ariaInvalidSelectors: ["#email"],
      requiredEmptySelectors: ["#phone", "#name"],
    });
    assert.equal(r.requiredFieldCount, 3);
  });
});

// ─── Generic errors ───────────────────────────────────────────────────────

describe("scanPageForValidationIssues — GENERIC_ERROR", () => {
  it('detects GENERIC_ERROR (WARNING) for "Something went wrong"', () => {
    const r = scan({ visibleText: ["Something went wrong"] });
    const issue = findCategory(r, "GENERIC_ERROR");
    assert.ok(issue);
    assert.equal(issue.severity, "WARNING");
    assert.equal(r.blocking, false);
  });

  it('detects GENERIC_ERROR (WARNING) for "An error occurred"', () => {
    const r = scan({ visibleText: ["An error occurred"] });
    assert.ok(hasCategory(r, "GENERIC_ERROR"));
  });

  it('detects GENERIC_ERROR (INFO) for "Please try again"', () => {
    const r = scan({ visibleText: ["Please try again"] });
    const issue = findCategory(r, "GENERIC_ERROR");
    assert.ok(issue);
    assert.equal(issue.severity, "INFO");
    assert.equal(r.blocking, false);
  });
});

// ─── Deduplication ────────────────────────────────────────────────────────

describe("scanPageForValidationIssues — deduplication", () => {
  it("multiple required-field phrases collapse to one REQUIRED_FIELD_EMPTY (no fieldSelector)", () => {
    const r = scan({
      visibleText: [
        "This field is required",
        "field is required",
        "Email is required",
      ],
    });
    const textIssues = r.issues.filter(
      (i) => i.category === "REQUIRED_FIELD_EMPTY" && i.fieldSelector === undefined,
    );
    assert.equal(textIssues.length, 1);
  });

  it("structural issues with distinct selectors are NOT deduplicated", () => {
    const r = scan({
      ariaInvalidSelectors: ["#email", "#phone"],
    });
    const ariaIssues = r.issues.filter((i) => i.category === "ARIA_INVALID");
    assert.equal(ariaIssues.length, 2);
  });

  it("text-match issue and structural issue for same category are kept separately (different keys)", () => {
    const r = scan({
      visibleText: ["This field is required"],
      requiredEmptySelectors: ["#email"],
    });
    // text issue: REQUIRED_FIELD_EMPTY :: ""
    // structural: REQUIRED_FIELD_EMPTY :: "#email"
    const reqIssues = r.issues.filter((i) => i.category === "REQUIRED_FIELD_EMPTY");
    assert.equal(reqIssues.length, 2);
  });
});

// ─── Counts and summary ───────────────────────────────────────────────────

describe("scanPageForValidationIssues — counts and summary", () => {
  it("errorCount equals number of BLOCKING issues", () => {
    const r = scan({
      visibleText: ["This field is required"],
      ariaInvalidSelectors: ["#email"],
    });
    assert.equal(r.errorCount, r.issues.filter((i) => i.severity === "BLOCKING").length);
  });

  it("warningCount equals number of WARNING issues", () => {
    const r = scan({
      visibleText: ["Something went wrong", "Please upload your resume"],
    });
    assert.equal(r.warningCount, r.issues.filter((i) => i.severity === "WARNING").length);
  });

  it("blocking is true when any BLOCKING issue exists", () => {
    const r = scan({ visibleText: ["This field is required"] });
    assert.equal(r.blocking, true);
    assert.ok(r.errorCount > 0);
  });

  it("blocking is false when only WARNING/INFO issues exist", () => {
    // "Something went wrong" → GENERIC_ERROR/WARNING wins deduplication (listed first).
    // "Please try again" → same category/key, deduplicated away.
    const r = scan({
      visibleText: ["Something went wrong", "Please try again"],
    });
    assert.equal(r.blocking, false);
    assert.equal(r.errorCount, 0);
    assert.ok(r.warningCount > 0);
  });

  it("summary includes detected category names", () => {
    const r = scan({ visibleText: ["This field is required"] });
    assert.ok(r.summary.includes("REQUIRED_FIELD_EMPTY"));
  });

  it("summary mentions blocking errors when present", () => {
    const r = scan({ visibleText: ["This field is required"] });
    assert.ok(r.summary.includes("blocking error"));
  });

  it("summary is clean when no issues detected", () => {
    const r = scanPageForValidationIssues(empty);
    assert.equal(r.summary, "No validation issues detected.");
  });

  it("summary pluralises correctly for multiple blocking errors", () => {
    const r = scan({
      visibleText: ["Unable to submit"],
      ariaInvalidSelectors: ["#email"],
      requiredEmptySelectors: ["#phone"],
    });
    assert.ok(r.errorCount >= 2);
    assert.ok(r.summary.includes("blocking errors"));
  });

  it("summary pluralises correctly for a single blocking error", () => {
    const r = scan({ visibleText: ["Upload failed"] });
    assert.equal(r.errorCount, 1);
    assert.ok(r.summary.includes("1 blocking error"));
    assert.ok(!r.summary.includes("blocking errors"));
  });
});

// ─── Real-world combined signals ──────────────────────────────────────────

describe("scanPageForValidationIssues — combined real-world signals", () => {
  it("handles a realistic post-submit failure with multiple issue types", () => {
    const r = scanPageForValidationIssues({
      visibleText: [
        "Please correct the errors before proceeding",
        "Email is required",
        "Invalid phone number",
      ],
      toastMessages: ["Submission failed. Please review the form."],
      ariaInvalidSelectors: ["#email-input"],
      actionType: "CLICK",
    });

    assert.equal(r.blocking, true);
    assert.ok(r.errorCount > 0);
    assert.ok(hasCategory(r, "SUBMIT_BLOCKED"), "missing SUBMIT_BLOCKED");
    assert.ok(hasCategory(r, "REQUIRED_FIELD_EMPTY"), "missing REQUIRED_FIELD_EMPTY");
    assert.ok(hasCategory(r, "INVALID_FORMAT"), "missing INVALID_FORMAT");
    assert.ok(hasCategory(r, "ARIA_INVALID"), "missing ARIA_INVALID");
  });

  it("handles a clean post-fill signal with benign page text", () => {
    const r = scanPageForValidationIssues({
      visibleText: ["First name", "Last name", "Email address", "Phone number"],
      ariaInvalidSelectors: [],
      requiredEmptySelectors: [],
      actionType: "TYPE",
    });
    assert.equal(r.blocking, false);
    assert.equal(r.issues.length, 0);
    assert.equal(r.summary, "No validation issues detected.");
  });

  it("handles a duplicate application scenario", () => {
    const r = scan({
      visibleText: ["You have already applied for this position."],
      toastMessages: ["Duplicate application detected."],
    });
    assert.ok(hasCategory(r, "DUPLICATE_APPLICATION"));
    assert.equal(r.blocking, true);
  });

  it("handles a CAPTCHA gate signal", () => {
    const r = scan({
      visibleText: ["Please complete the captcha to continue"],
      ariaInvalidSelectors: [],
    });
    assert.ok(hasCategory(r, "CAPTCHA_REQUIRED"));
    assert.equal(r.blocking, true);
  });

  it("handles a missing disclosure signal from a TYPE action", () => {
    const r = scanPageForValidationIssues({
      visibleText: ["You must accept the terms before continuing"],
      actionType: "TYPE",
    });
    assert.ok(hasCategory(r, "DISCLOSURE_MISSING"));
    assert.equal(r.blocking, true);
  });

  it("counts INFO issues separately from warnings and errors", () => {
    const r = scan({
      visibleText: ["Please try again"],
    });
    const infoCount = r.issues.filter((i) => i.severity === "INFO").length;
    assert.ok(infoCount > 0);
    assert.equal(r.blocking, false);
    assert.equal(r.errorCount, 0);
  });
});

// ─── Type consistency ─────────────────────────────────────────────────────

describe("scanPageForValidationIssues — type consistency", () => {
  it("every issue has required shape: category, severity, message", () => {
    const r = scanPageForValidationIssues({
      visibleText: ["This field is required", "Submission failed"],
      ariaInvalidSelectors: ["#email"],
    });
    for (const issue of r.issues) {
      assert.ok(typeof issue.category === "string", "category must be string");
      assert.ok(typeof issue.severity === "string", "severity must be string");
      assert.ok(typeof issue.message === "string", "message must be string");
      assert.ok(issue.message.length > 0, "message must not be empty");
    }
  });

  it("severity is always one of BLOCKING | WARNING | INFO", () => {
    const validSeverities: ValidationIssueSeverity[] = ["BLOCKING", "WARNING", "INFO"];
    const r = scanPageForValidationIssues({
      visibleText: [
        "This field is required",
        "Something went wrong",
        "Please try again",
      ],
    });
    for (const issue of r.issues) {
      assert.ok(
        validSeverities.includes(issue.severity),
        `Unexpected severity: ${issue.severity}`,
      );
    }
  });
});
