import type { PageClassifier } from "@dejsol/core";

// ─── Page signals ─────────────────────────────────────────────────────────

/**
 * Observable signals extracted from a page, used for deterministic classification.
 * The caller (browser-worker or state machine) is responsible for collecting these.
 */
export interface PageSignals {
  url: string;
  title: string;
  formCount: number;
  inputCount: number;
  hasFileInput: boolean;
  hasPasswordInput: boolean;
  buttonTexts: string[];
  headingTexts: string[];
  metaDescription?: string;
}

// ─── Classification result ────────────────────────────────────────────────

export type UniversalPageType =
  | "job_listing"
  | "application_form"
  | "login_gate"
  | "account_creation"
  | "resume_upload"
  | "personal_info"
  | "screening_questions"
  | "review_page"
  | "confirmation"
  | "error_page"
  | "unknown";

export interface ClassifiedPage {
  pageType: UniversalPageType;
  confidence: number;
  matchedSignals: string[];
}

// ─── Fallback hook for future intelligence integration ────────────────────

/**
 * Async fallback for pages that cannot be classified deterministically.
 * The intelligence package will implement this interface.
 */
export interface PageClassifierFallback {
  classifyPage(signals: PageSignals): Promise<ClassifiedPage>;
}

// ─── Deterministic rules ──────────────────────────────────────────────────

interface ClassificationRule {
  pageType: UniversalPageType;
  weight: number;
  test(signals: PageSignals): string | null;
}

const RULES: ClassificationRule[] = [
  // ── Confirmation ──
  {
    pageType: "confirmation",
    weight: 0.9,
    test(s) {
      const combined = [s.title, ...s.headingTexts].join(" ").toLowerCase();
      const patterns = [
        "thank you for applying",
        "application submitted",
        "application received",
        "your application has been",
        "successfully submitted",
        "confirmation",
      ];
      for (const p of patterns) {
        if (combined.includes(p)) return `text: "${p}"`;
      }
      return null;
    },
  },

  // ── Error page ──
  {
    pageType: "error_page",
    weight: 0.85,
    test(s) {
      const combined = [s.title, ...s.headingTexts].join(" ").toLowerCase();
      const patterns = [
        "404",
        "page not found",
        "something went wrong",
        "application error",
        "job no longer available",
        "this position has been filled",
      ];
      for (const p of patterns) {
        if (combined.includes(p)) return `text: "${p}"`;
      }
      return null;
    },
  },

  // ── Login gate ──
  {
    pageType: "login_gate",
    weight: 0.85,
    test(s) {
      if (s.hasPasswordInput) {
        const btnLower = s.buttonTexts.map((t) => t.toLowerCase());
        const loginPhrases = ["sign in", "log in", "login"];
        for (const phrase of loginPhrases) {
          if (btnLower.some((b) => b.includes(phrase))) {
            return `password input + button: "${phrase}"`;
          }
        }
        return "password input present";
      }
      return null;
    },
  },

  // ── Account creation ──
  {
    pageType: "account_creation",
    weight: 0.8,
    test(s) {
      if (!s.hasPasswordInput) return null;
      const btnLower = s.buttonTexts.map((t) => t.toLowerCase());
      const signupPhrases = ["create account", "sign up", "register"];
      for (const phrase of signupPhrases) {
        if (btnLower.some((b) => b.includes(phrase))) {
          return `password input + button: "${phrase}"`;
        }
      }
      return null;
    },
  },

  // ── Resume upload ──
  {
    pageType: "resume_upload",
    weight: 0.85,
    test(s) {
      if (!s.hasFileInput) return null;
      const combined = [...s.headingTexts, ...s.buttonTexts, s.title]
        .join(" ")
        .toLowerCase();
      if (/resume|cv|curriculum/i.test(combined)) {
        return "file input + resume/CV text";
      }
      return null;
    },
  },

  // ── Application form (generic) ──
  {
    pageType: "application_form",
    weight: 0.7,
    test(s) {
      if (s.formCount > 0 && s.inputCount >= 3) {
        const btnLower = s.buttonTexts.map((t) => t.toLowerCase());
        const submitPhrases = [
          "submit application",
          "apply",
          "submit",
          "send application",
        ];
        for (const phrase of submitPhrases) {
          if (btnLower.some((b) => b.includes(phrase))) {
            return `form with ≥3 inputs + button: "${phrase}"`;
          }
        }
        if (s.inputCount >= 5) {
          return `form with ≥5 inputs`;
        }
      }
      return null;
    },
  },

  // ── Review page ──
  {
    pageType: "review_page",
    weight: 0.75,
    test(s) {
      const combined = [...s.headingTexts, s.title].join(" ").toLowerCase();
      const patterns = ["review your", "review application", "please review", "summary"];
      for (const p of patterns) {
        if (combined.includes(p)) return `text: "${p}"`;
      }
      return null;
    },
  },

  // ── Job listing ──
  {
    pageType: "job_listing",
    weight: 0.65,
    test(s) {
      const urlLower = s.url.toLowerCase();
      if (/\/jobs?\/\d+|\/positions?\/|\/careers?\//i.test(urlLower)) {
        const combined = [...s.headingTexts, s.title].join(" ").toLowerCase();
        const patterns = ["apply", "department", "location", "description", "qualifications"];
        let hits = 0;
        const matched: string[] = [];
        for (const p of patterns) {
          if (combined.includes(p)) {
            hits++;
            matched.push(p);
          }
        }
        if (hits >= 2) return `job URL + text: ${matched.join(", ")}`;
      }
      return null;
    },
  },

  // ── Personal info (form with few inputs, no file) ──
  {
    pageType: "personal_info",
    weight: 0.6,
    test(s) {
      if (s.formCount > 0 && s.inputCount >= 2 && s.inputCount <= 8 && !s.hasFileInput && !s.hasPasswordInput) {
        const combined = [...s.headingTexts, s.title].join(" ").toLowerCase();
        const patterns = ["personal", "contact", "your information", "about you"];
        for (const p of patterns) {
          if (combined.includes(p)) return `form (${s.inputCount} inputs) + text: "${p}"`;
        }
      }
      return null;
    },
  },

  // ── Screening questions ──
  {
    pageType: "screening_questions",
    weight: 0.6,
    test(s) {
      const combined = [...s.headingTexts, s.title].join(" ").toLowerCase();
      const patterns = ["screening", "additional questions", "questionnaire", "custom questions"];
      for (const p of patterns) {
        if (combined.includes(p)) return `text: "${p}"`;
      }
      return null;
    },
  },
];

// ─── Main classifier ─────────────────────────────────────────────────────

/**
 * Classify a page deterministically using observable signals.
 * Returns the best match, or { pageType: "unknown", confidence: 0 } if nothing matches.
 */
export function classifyPageDeterministic(signals: PageSignals): ClassifiedPage {
  let best: ClassifiedPage = {
    pageType: "unknown",
    confidence: 0,
    matchedSignals: [],
  };

  for (const rule of RULES) {
    const matched = rule.test(signals);
    if (matched && rule.weight > best.confidence) {
      best = {
        pageType: rule.pageType,
        confidence: rule.weight,
        matchedSignals: [matched],
      };
    }
  }

  return best;
}

/**
 * Classify a page, falling back to the intelligence hook when
 * deterministic confidence is below the threshold.
 */
export async function classifyPage(
  signals: PageSignals,
  fallback?: PageClassifierFallback,
  confidenceThreshold = 0.6,
): Promise<ClassifiedPage> {
  const deterministic = classifyPageDeterministic(signals);

  if (deterministic.confidence >= confidenceThreshold) {
    return deterministic;
  }

  if (fallback) {
    return fallback.classifyPage(signals);
  }

  return deterministic;
}

/**
 * Convert a ClassifiedPage to the core PageClassifier shape for storage
 * in an AtsAccelerator or PortalFingerprint.
 */
export function toPageClassifier(result: ClassifiedPage): PageClassifier {
  return {
    name: result.pageType,
    selectors: [],
    textPatterns: result.matchedSignals,
    confidence: result.confidence,
  };
}
