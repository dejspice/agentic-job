import type { RunMode } from "../enums/run-mode.js";
import type { RunOutcome } from "../enums/run-outcome.js";
import type { StateName } from "../enums/state-name.js";

export interface StateHistoryEntry {
  state: StateName;
  enteredAt: string;
  exitedAt?: string;
  outcome: "success" | "failure" | "skipped" | "escalated";
  durationMs?: number;
  error?: string;
}

export interface RunAnswers {
  [fieldKey: string]: {
    value: string;
    source: "answer_bank" | "generated" | "profile" | "manual";
    confidence?: number;
  };
}

export interface ErrorLogEntry {
  timestamp: string;
  state: StateName;
  message: string;
  stack?: string;
  recoverable: boolean;
}

export interface ArtifactUrls {
  screenshots?: Record<string, string>;
  domSnapshots?: Record<string, string>;
  harFile?: string;
  confirmationScreenshot?: string;
}

export interface RunCost {
  inputTokens?: number;
  outputTokens?: number;
  llmCalls?: number;
  totalLatencyMs?: number;
  estimatedCostUsd?: number;
}

export interface ApplyRun {
  id: string;
  jobId: string;
  candidateId: string;
  mode: RunMode;
  runtimeProvider: string | null;
  resumeFile: string | null;
  currentState: string | null;
  stateHistoryJson: StateHistoryEntry[];
  answersJson: RunAnswers;
  errorLogJson: ErrorLogEntry[];
  artifactUrlsJson: ArtifactUrls;
  confirmationId: string | null;
  outcome: RunOutcome | null;
  humanInterventions: number;
  costJson: RunCost;
  startedAt: Date;
  completedAt: Date | null;
}
