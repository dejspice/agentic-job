/**
 * Validation watcher for the apply workflow state machine.
 *
 * Runs after every CLICK and TYPE action (ARCHITECTURE.MD rule 4).
 * Inspects page-derived signals, detects common validation patterns, and
 * normalizes findings into typed issues for the orchestrator to act on.
 *
 * Design constraints:
 * - Pure scanner / detector — no Playwright, no browser automation, no retry logic.
 * - Input is page-derived signal populated externally by the browser-worker.
 * - Deterministic pattern matching preferred over heuristics.
 * - Output is a structured, typed result the state machine can act on.
 */

// ─── Issue categories ──────────────────────────────────────────────────────

export type ValidationIssueCategory =
  | "REQUIRED_FIELD_EMPTY"
  | "INVALID_FORMAT"
  | "UPLOAD_MISSING"
  | "UPLOAD_FAILED"
  | "DUPLICATE_APPLICATION"
  | "CAPTCHA_REQUIRED"
  | "DISCLOSURE_MISSING"
  | "SUBMIT_BLOCKED"
  | "ARIA_INVALID"
  | "GENERIC_ERROR";

/**
 * BLOCKING — prevents forward progress; state machine should retry or escalate.
 * WARNING  — logged but may not block; state machine should record and continue.
 * INFO     — informational only; no action required.
 */
export type ValidationIssueSeverity = "BLOCKING" | "WARNING" | "INFO";

export interface ValidationIssue {
  category: ValidationIssueCategory;
  severity: ValidationIssueSeverity;
  message: string;
  /** Selector of the field responsible for the issue, if structurally known. */
  fieldSelector?: string;
  /** The raw text string that triggered this issue, for audit trails. */
  rawText?: string;
}

// ─── Input signal ──────────────────────────────────────────────────────────

/**
 * Page-derived signals passed to the watcher after a CLICK or TYPE action.
 *
 * Populated by the browser-worker (DOM snapshot, accessibility tree, toast
 * capture). This interface is the contract between the browser-worker and the
 * validation watcher — the watcher itself has no browser dependencies.
 */
export interface PageValidationSignal {
  /** Visible text extracted from the page after the action. */
  visibleText: string[];
  /** CSS selectors of elements with aria-invalid="true". */
  ariaInvalidSelectors?: string[];
  /** CSS selectors of input/select/textarea elements marked required and currently empty. */
  requiredEmptySelectors?: string[];
  /** Text content of active toast, banner, or inline error messages. */
  toastMessages?: string[];
  /** Page title at time of scan — used for high-level context. */
  pageTitle?: string;
  /** Type of action that triggered this scan. */
  actionType?: "CLICK" | "TYPE";
}

// ─── Result ────────────────────────────────────────────────────────────────

export interface ValidationWatcherResult {
  /** All detected validation issues, deduplicated. */
  issues: ValidationIssue[];
  /** True when at least one BLOCKING-severity issue is present. */
  blocking: boolean;
  /** Count of fields detected as required-but-empty or aria-invalid. */
  requiredFieldCount: number;
  /** Count of BLOCKING-severity issues. */
  errorCount: number;
  /** Count of WARNING-severity issues. */
  warningCount: number;
  /** Human-readable summary for logging and escalation messages. */
  summary: string;
}

// ─── Pattern matchers ──────────────────────────────────────────────────────

interface PatternMatcher {
  pattern: RegExp;
  category: ValidationIssueCategory;
  severity: ValidationIssueSeverity;
  message: string;
}

/**
 * Ordered table of deterministic regex matchers.
 * Each entry maps a text pattern to a typed issue.
 * More specific patterns are listed before broader catch-alls.
 */
const PATTERN_MATCHERS: readonly PatternMatcher[] = [
  // ── Required fields ─────────────────────────────────────────────────────
  {
    pattern: /this field is required/i,
    category: "REQUIRED_FIELD_EMPTY",
    severity: "BLOCKING",
    message: "A required field is empty",
  },
  {
    pattern: /field is required/i,
    category: "REQUIRED_FIELD_EMPTY",
    severity: "BLOCKING",
    message: "A required field is empty",
  },
  {
    pattern: /\bis required\b/i,
    category: "REQUIRED_FIELD_EMPTY",
    severity: "BLOCKING",
    message: "A required field is empty",
  },
  {
    pattern: /please (fill in|complete|enter) (this|the|a) (field|input)/i,
    category: "REQUIRED_FIELD_EMPTY",
    severity: "WARNING",
    message: "A field requires completion",
  },

  // ── Format validation ────────────────────────────────────────────────────
  {
    pattern: /invalid (email|e-mail)(?: address)?/i,
    category: "INVALID_FORMAT",
    severity: "BLOCKING",
    message: "Invalid email address",
  },
  {
    pattern: /invalid (phone|phone number|telephone)(?: number)?/i,
    category: "INVALID_FORMAT",
    severity: "BLOCKING",
    message: "Invalid phone number",
  },
  {
    pattern: /enter a valid (email|phone|date|url|number)/i,
    category: "INVALID_FORMAT",
    severity: "BLOCKING",
    message: "Field value is in an invalid format",
  },
  {
    pattern: /must be a valid/i,
    category: "INVALID_FORMAT",
    severity: "BLOCKING",
    message: "Field value does not meet format requirements",
  },
  {
    pattern: /incorrect (format|value)/i,
    category: "INVALID_FORMAT",
    severity: "WARNING",
    message: "Field has an incorrect format",
  },
  {
    pattern: /format (is )?(invalid|incorrect|not supported)/i,
    category: "INVALID_FORMAT",
    severity: "WARNING",
    message: "Field format is not accepted",
  },

  // ── Upload issues ────────────────────────────────────────────────────────
  {
    pattern: /upload (failed|error|unsuccessful)/i,
    category: "UPLOAD_FAILED",
    severity: "BLOCKING",
    message: "File upload failed",
  },
  {
    pattern: /could not (read|parse|process) (your |the )?(resume|cv|document|file)/i,
    category: "UPLOAD_FAILED",
    severity: "BLOCKING",
    message: "Uploaded file could not be processed",
  },
  {
    pattern: /file (size |type )?(is )?(not (supported|allowed|valid)|too large|too small)/i,
    category: "UPLOAD_FAILED",
    severity: "BLOCKING",
    message: "File type or size is not accepted",
  },
  {
    pattern: /no (file|resume|cv) (uploaded|selected|attached)/i,
    category: "UPLOAD_MISSING",
    severity: "BLOCKING",
    message: "No file has been uploaded",
  },
  {
    pattern: /please upload (your |a )?(resume|cv|document|file)/i,
    category: "UPLOAD_MISSING",
    severity: "WARNING",
    message: "A file upload is required",
  },
  {
    pattern: /(parse|parsing) (failed|error)/i,
    category: "UPLOAD_FAILED",
    severity: "WARNING",
    message: "Resume parsing encountered an error",
  },

  // ── Duplicate application ─────────────────────────────────────────────────
  {
    pattern: /already applied/i,
    category: "DUPLICATE_APPLICATION",
    severity: "BLOCKING",
    message: "Candidate has already applied for this position",
  },
  {
    pattern: /you (have )?already (submitted|applied)/i,
    category: "DUPLICATE_APPLICATION",
    severity: "BLOCKING",
    message: "Application already submitted",
  },
  {
    pattern: /application already (exists|submitted|on file)/i,
    category: "DUPLICATE_APPLICATION",
    severity: "BLOCKING",
    message: "Duplicate application detected",
  },
  {
    pattern: /duplicate application/i,
    category: "DUPLICATE_APPLICATION",
    severity: "BLOCKING",
    message: "Duplicate application detected",
  },

  // ── CAPTCHA / verification ────────────────────────────────────────────────
  {
    pattern: /captcha/i,
    category: "CAPTCHA_REQUIRED",
    severity: "BLOCKING",
    message: "CAPTCHA challenge detected",
  },
  {
    pattern: /verification (required|needed)/i,
    category: "CAPTCHA_REQUIRED",
    severity: "BLOCKING",
    message: "Verification challenge required",
  },
  {
    pattern: /prove (you are|you're) (not )?human/i,
    category: "CAPTCHA_REQUIRED",
    severity: "BLOCKING",
    message: "Human verification required",
  },
  {
    pattern: /security check/i,
    category: "CAPTCHA_REQUIRED",
    severity: "WARNING",
    message: "Security check may be active",
  },

  // ── Legal disclosures ─────────────────────────────────────────────────────
  {
    pattern: /must (accept|acknowledge|agree to) (the )?(terms|agreement|disclosure|policy|consent)/i,
    category: "DISCLOSURE_MISSING",
    severity: "BLOCKING",
    message: "Required legal disclosure not acknowledged",
  },
  {
    pattern: /please (accept|acknowledge|check|confirm) (the )?(terms|agreement|disclosure|consent|policy)/i,
    category: "DISCLOSURE_MISSING",
    severity: "WARNING",
    message: "Legal disclosure acknowledgement required",
  },

  // ── Submit-blocking errors ────────────────────────────────────────────────
  {
    pattern: /(fix|correct|resolve|address) (the )?(errors?|issues?|problems?) (before|to) (submit|proceed|continu)/i,
    category: "SUBMIT_BLOCKED",
    severity: "BLOCKING",
    message: "Page has errors that must be resolved before submitting",
  },
  {
    pattern: /unable to submit/i,
    category: "SUBMIT_BLOCKED",
    severity: "BLOCKING",
    message: "Submission is blocked",
  },
  {
    pattern: /submission (failed|error|unsuccessful)/i,
    category: "SUBMIT_BLOCKED",
    severity: "BLOCKING",
    message: "Application submission failed",
  },
  {
    pattern: /\b(errors?|issues?) (found|detected) on (this|the) (page|form)\b/i,
    category: "SUBMIT_BLOCKED",
    severity: "BLOCKING",
    message: "Validation errors found on form",
  },
  {
    pattern: /please (fix|correct|resolve) (the )?(errors?|issues?|problems?)/i,
    category: "SUBMIT_BLOCKED",
    severity: "WARNING",
    message: "Form errors need correction",
  },

  // ── Generic errors ────────────────────────────────────────────────────────
  {
    pattern: /(something went wrong|an error occurred|unexpected error)/i,
    category: "GENERIC_ERROR",
    severity: "WARNING",
    message: "An unexpected error occurred on the page",
  },
  {
    pattern: /please try again/i,
    category: "GENERIC_ERROR",
    severity: "INFO",
    message: "Page is asking the user to retry",
  },
];

// ─── Internal helpers ──────────────────────────────────────────────────────

/** Run all pattern matchers against a single text string. */
function matchText(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const matcher of PATTERN_MATCHERS) {
    if (matcher.pattern.test(text)) {
      issues.push({
        category: matcher.category,
        severity: matcher.severity,
        message: matcher.message,
        rawText: text,
      });
    }
  }
  return issues;
}

/**
 * Deduplicate issues by (category, fieldSelector) key.
 * Preserves the first occurrence encountered — text matches come before
 * structural matches in the scan order so text-rich issues win.
 */
function deduplicateIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const result: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.category}::${issue.fieldSelector ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(issue);
    }
  }
  return result;
}

function buildSummary(
  issues: ValidationIssue[],
  errorCount: number,
  warningCount: number,
): string {
  if (issues.length === 0) {
    return "No validation issues detected.";
  }
  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} blocking error${errorCount !== 1 ? "s" : ""}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount !== 1 ? "s" : ""}`);
  }
  const infoCount = issues.length - errorCount - warningCount;
  if (infoCount > 0) {
    parts.push(`${infoCount} info`);
  }
  const categories = [...new Set(issues.map((i) => i.category))].join(", ");
  return `${parts.join(", ")} detected. Categories: ${categories}.`;
}

// ─── Main scan function ────────────────────────────────────────────────────

/**
 * Inspect page-derived signals and return a structured validation result.
 *
 * Called by the state machine orchestrator after every CLICK and TYPE command
 * (ARCHITECTURE.MD rule 4). The caller (browser-worker or state handler)
 * supplies pre-extracted page signals; this function performs no I/O.
 *
 * Scan order:
 * 1. Visible text content — pattern-matched against PATTERN_MATCHERS.
 * 2. Toast / banner messages — same pattern matching, higher signal reliability.
 * 3. aria-invalid selectors — structural ARIA_INVALID issues per element.
 * 4. Required-but-empty selectors — structural REQUIRED_FIELD_EMPTY per element.
 * 5. Deduplication by (category, fieldSelector).
 * 6. Aggregation into counts and summary.
 */
export function scanPageForValidationIssues(
  signal: PageValidationSignal,
): ValidationWatcherResult {
  const rawIssues: ValidationIssue[] = [];

  for (const text of signal.visibleText) {
    rawIssues.push(...matchText(text));
  }

  for (const text of signal.toastMessages ?? []) {
    rawIssues.push(...matchText(text));
  }

  for (const selector of signal.ariaInvalidSelectors ?? []) {
    rawIssues.push({
      category: "ARIA_INVALID",
      severity: "BLOCKING",
      message: "Field is marked aria-invalid",
      fieldSelector: selector,
    });
  }

  for (const selector of signal.requiredEmptySelectors ?? []) {
    rawIssues.push({
      category: "REQUIRED_FIELD_EMPTY",
      severity: "BLOCKING",
      message: "Required field is empty",
      fieldSelector: selector,
    });
  }

  const issues = deduplicateIssues(rawIssues);

  const errorCount = issues.filter((i) => i.severity === "BLOCKING").length;
  const warningCount = issues.filter((i) => i.severity === "WARNING").length;
  const requiredFieldCount = issues.filter(
    (i) =>
      i.category === "REQUIRED_FIELD_EMPTY" || i.category === "ARIA_INVALID",
  ).length;
  const blocking = errorCount > 0;
  const summary = buildSummary(issues, errorCount, warningCount);

  return {
    issues,
    blocking,
    requiredFieldCount,
    errorCount,
    warningCount,
    summary,
  };
}
