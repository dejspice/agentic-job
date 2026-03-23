export type SelectorTarget =
  | { kind: "css"; value: string }
  | { kind: "coordinates"; x: number; y: number }
  | { kind: "semantic"; label: string };

export type WorkerCommand =
  | { type: "NAVIGATE"; url: string }
  | { type: "CLICK"; target: SelectorTarget; force?: boolean }
  | { type: "CHECK"; selector: string; force?: boolean }
  | { type: "TYPE"; selector: string; value: string; clearFirst?: boolean; sequential?: boolean }
  | { type: "UPLOAD"; selector: string; filePath: string; triggerSelector?: string }
  | { type: "SELECT"; selector: string; value: string }
  | { type: "SCREENSHOT"; fullPage?: boolean }
  | { type: "DOM_SNAPSHOT"; scope?: string }
  | { type: "ACCESSIBILITY_TREE"; scope?: string }
  | { type: "READ_TEXT"; selector: string }
  | { type: "WAIT_FOR"; target: string | (() => boolean); timeoutMs: number }
  | { type: "CLASSIFY_PAGE" }
  | { type: "EXTRACT_FIELDS" }
  | { type: "EXTRACT_OPTIONS" };

export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
  screenshotUrl?: string;
  durationMs: number;
}
