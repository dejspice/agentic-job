// ─── Navigation candidate ─────────────────────────────────────────────────

/**
 * A clickable element on the page that may advance the application flow.
 */
export interface NavigationCandidate {
  selector: string;
  text: string;
  role: "submit" | "next" | "apply" | "upload" | "review" | "login" | "skip" | "other";
  confidence: number;
}

// ─── Navigation signals ───────────────────────────────────────────────────

/**
 * Observable button/link information extracted from the page.
 * Each entry represents a clickable element.
 */
export interface NavigableElement {
  selector: string;
  tag: "button" | "a" | "input";
  text: string;
  type?: string;
  isVisible: boolean;
  isDisabled: boolean;
}

// ─── Fallback hook for future intelligence integration ────────────────────

/**
 * Async fallback for navigation decisions that cannot be made deterministically.
 * The intelligence package will implement this interface.
 */
export interface NavigatorFallback {
  chooseAction(elements: NavigableElement[]): Promise<NavigationCandidate | null>;
}

// ─── Pattern tables ───────────────────────────────────────────────────────

interface NavPattern {
  pattern: RegExp;
  role: NavigationCandidate["role"];
  baseConfidence: number;
}

const SUBMIT_PATTERNS: NavPattern[] = [
  { pattern: /^submit\s*application$/i, role: "submit", baseConfidence: 0.95 },
  { pattern: /^submit$/i, role: "submit", baseConfidence: 0.9 },
  { pattern: /^send\s*application$/i, role: "submit", baseConfidence: 0.9 },
  { pattern: /^complete\s*application$/i, role: "submit", baseConfidence: 0.85 },
  { pattern: /^finish$/i, role: "submit", baseConfidence: 0.7 },
];

const NEXT_PATTERNS: NavPattern[] = [
  { pattern: /^next$/i, role: "next", baseConfidence: 0.9 },
  { pattern: /^continue$/i, role: "next", baseConfidence: 0.9 },
  { pattern: /^next\s*step$/i, role: "next", baseConfidence: 0.85 },
  { pattern: /^proceed$/i, role: "next", baseConfidence: 0.8 },
  { pattern: /^save\s*(?:&|and)\s*continue$/i, role: "next", baseConfidence: 0.85 },
  { pattern: /^save\s*(?:&|and)\s*next$/i, role: "next", baseConfidence: 0.85 },
];

const APPLY_PATTERNS: NavPattern[] = [
  { pattern: /^apply\s*(?:now|for\s*this\s*job)?$/i, role: "apply", baseConfidence: 0.9 },
  { pattern: /^apply$/i, role: "apply", baseConfidence: 0.9 },
  { pattern: /^start\s*application$/i, role: "apply", baseConfidence: 0.85 },
  { pattern: /^i'm\s*interested$/i, role: "apply", baseConfidence: 0.7 },
];

const UPLOAD_PATTERNS: NavPattern[] = [
  { pattern: /^upload\s*(?:resume|cv|file)$/i, role: "upload", baseConfidence: 0.85 },
  { pattern: /^attach\s*(?:resume|cv|file)$/i, role: "upload", baseConfidence: 0.85 },
  { pattern: /^choose\s*file$/i, role: "upload", baseConfidence: 0.7 },
  { pattern: /^browse$/i, role: "upload", baseConfidence: 0.6 },
];

const REVIEW_PATTERNS: NavPattern[] = [
  { pattern: /^review$/i, role: "review", baseConfidence: 0.85 },
  { pattern: /^review\s*application$/i, role: "review", baseConfidence: 0.9 },
  { pattern: /^preview$/i, role: "review", baseConfidence: 0.75 },
];

const LOGIN_PATTERNS: NavPattern[] = [
  { pattern: /^(?:sign|log)\s*in$/i, role: "login", baseConfidence: 0.85 },
  { pattern: /^login$/i, role: "login", baseConfidence: 0.85 },
];

const SKIP_PATTERNS: NavPattern[] = [
  { pattern: /^skip$/i, role: "skip", baseConfidence: 0.8 },
  { pattern: /^skip\s*(?:this|for\s*now)$/i, role: "skip", baseConfidence: 0.8 },
  { pattern: /^no\s*thanks$/i, role: "skip", baseConfidence: 0.7 },
  { pattern: /^maybe\s*later$/i, role: "skip", baseConfidence: 0.65 },
];

const ALL_PATTERNS = [
  ...SUBMIT_PATTERNS,
  ...NEXT_PATTERNS,
  ...APPLY_PATTERNS,
  ...UPLOAD_PATTERNS,
  ...REVIEW_PATTERNS,
  ...LOGIN_PATTERNS,
  ...SKIP_PATTERNS,
];

// ─── Core matching ────────────────────────────────────────────────────────

function matchElement(el: NavigableElement): NavigationCandidate | null {
  if (!el.isVisible || el.isDisabled) return null;

  const text = el.text.trim();
  if (!text) return null;

  if (el.tag === "input" && el.type === "submit") {
    return {
      selector: el.selector,
      text,
      role: "submit",
      confidence: 0.85,
    };
  }

  for (const pat of ALL_PATTERNS) {
    if (pat.pattern.test(text)) {
      return {
        selector: el.selector,
        text,
        role: pat.role,
        confidence: pat.baseConfidence,
      };
    }
  }

  return null;
}

function rankCandidates(candidates: NavigationCandidate[]): NavigationCandidate[] {
  return [...candidates].sort((a, b) => b.confidence - a.confidence);
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Score all navigable elements and return recognized candidates,
 * sorted by confidence descending.
 */
export function identifyCandidates(elements: NavigableElement[]): NavigationCandidate[] {
  const candidates: NavigationCandidate[] = [];
  for (const el of elements) {
    const match = matchElement(el);
    if (match) candidates.push(match);
  }
  return rankCandidates(candidates);
}

/**
 * Find the most likely "next step" action (continue, next, save & continue).
 */
export function findNextAction(elements: NavigableElement[]): NavigationCandidate | null {
  const candidates = identifyCandidates(elements);
  return candidates.find((c) => c.role === "next") ?? null;
}

/**
 * Find the most likely submit button.
 */
export function findSubmitAction(elements: NavigableElement[]): NavigationCandidate | null {
  const candidates = identifyCandidates(elements);
  return candidates.find((c) => c.role === "submit") ?? null;
}

/**
 * Find the most likely "Apply" entry point on a job listing page.
 */
export function findApplyEntry(elements: NavigableElement[]): NavigationCandidate | null {
  const candidates = identifyCandidates(elements);
  return candidates.find((c) => c.role === "apply") ?? null;
}

/**
 * Find the best progression action, preferring submit > next > review > apply.
 * Falls back to the intelligence hook when no deterministic match is found.
 */
export async function findBestAction(
  elements: NavigableElement[],
  fallback?: NavigatorFallback,
): Promise<NavigationCandidate | null> {
  const candidates = identifyCandidates(elements);

  const priority: NavigationCandidate["role"][] = ["submit", "next", "review", "apply"];
  for (const role of priority) {
    const match = candidates.find((c) => c.role === role);
    if (match) return match;
  }

  if (candidates.length > 0) return candidates[0];

  if (fallback) {
    return fallback.chooseAction(elements);
  }

  return null;
}
