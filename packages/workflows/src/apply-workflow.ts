import {
  proxyActivities,
  setHandler,
  condition,
} from "@temporalio/workflow";
import { StateName, RunMode, RunOutcome, TERMINAL_STATES } from "@dejsol/core";
import type { AtsType } from "@dejsol/core";

import {
  emptyBundle,
  mergeArtifacts,
  type RunArtifactBundle,
} from "./artifacts.js";

import {
  reviewApprovalSignal,
  cancelRequestSignal,
} from "./signals.js";
import type { ReviewApprovalPayload, CancelRequestPayload } from "./signals.js";

import {
  currentStateQuery,
  workflowStatusQuery,
  progressQuery,
} from "./queries.js";
import type {
  WorkflowPhase,
  WorkflowStatus,
  WorkflowProgress,
  WorkflowErrorEntry,
} from "./queries.js";

import type { BrowserActivityResult } from "./activities/index.js";
import type * as activities from "./activities/index.js";

const TOTAL_STATES = 14;
const REVIEW_TIMEOUT = "24h";

/** States that are handled by dedicated activities rather than the browser loop. */
const DEDICATED_ACTIVITY_STATES: ReadonlySet<StateName> = new Set([
  StateName.INIT,
  StateName.SUBMIT,
  StateName.CAPTURE_CONFIRMATION,
]);

// --- Workflow I/O types ---

export interface ApplyWorkflowInput {
  runId: string;
  jobId: string;
  candidateId: string;
  jobUrl: string;
  mode: RunMode;
  atsType: AtsType;
  resumeFile?: string;
}

export interface ApplyWorkflowResult {
  outcome: RunOutcome;
  confirmationId?: string;
  finalState: StateName | null;
  statesCompleted: StateName[];
  errors: WorkflowErrorEntry[];
  /**
   * All artifact references captured across the run, grouped by state and
   * ordered chronologically.  Ready for persistence into
   * ApplyRun.artifactUrlsJson via bundleToArtifactUrls().
   */
  artifacts: RunArtifactBundle;
}

// --- Workflow implementation ---

export async function applyWorkflow(
  input: ApplyWorkflowInput,
): Promise<ApplyWorkflowResult> {
  // Proxy all four activity groups with appropriate timeouts
  const {
    initActivity,
    browserActivity,
    submitActivity,
    captureActivity,
  } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5m",
    retry: { maximumAttempts: 3 },
  });

  // --- Mutable workflow state ---
  let currentState: StateName | null = null;
  let phase: WorkflowPhase = "initializing";
  const statesCompleted: StateName[] = [];
  const errors: WorkflowErrorEntry[] = [];
  let data: Record<string, unknown> = {};
  let reviewResult: ReviewApprovalPayload | undefined;
  let cancelRequested: CancelRequestPayload | undefined;

  // Accumulates all ArtifactReferences returned by activity results.
  const bundle = emptyBundle();

  // --- Register signal handlers ---
  setHandler(reviewApprovalSignal, (payload: ReviewApprovalPayload) => {
    reviewResult = payload;
  });
  setHandler(cancelRequestSignal, (payload: CancelRequestPayload) => {
    cancelRequested = payload;
  });

  // --- Register query handlers ---
  setHandler(currentStateQuery, () => currentState);
  setHandler(workflowStatusQuery, (): WorkflowStatus => ({
    currentState,
    phase,
    statesCompleted: [...statesCompleted],
    errors: [...errors],
  }));
  setHandler(progressQuery, (): WorkflowProgress => ({
    totalStates: TOTAL_STATES,
    completedStates: statesCompleted.length,
    currentState,
    phase,
    percentComplete: Math.round((statesCompleted.length / TOTAL_STATES) * 100),
  }));

  // --- Phase 1: Init ---
  const initResult = await initActivity({
    runId: input.runId,
    jobId: input.jobId,
    candidateId: input.candidateId,
    jobUrl: input.jobUrl,
    mode: input.mode,
    atsType: input.atsType,
    resumeFile: input.resumeFile,
  });

  statesCompleted.push(StateName.INIT);

  if (!initResult.success) {
    phase = "failed";
    errors.push({
      state: StateName.INIT,
      message: initResult.error ?? "Init failed",
      timestamp: new Date().toISOString(),
    });
    return buildResult(RunOutcome.FAILED, StateName.INIT, statesCompleted, errors, bundle);
  }

  data = { ...data, ...initResult.data };
  currentState = initResult.nextState;
  phase = "running";

  // --- Phase 2: State-machine-driven execution loop ---
  // Runs from OPEN_JOB_PAGE through PRE_SUBMIT_CHECK.
  // Each iteration executes one state via browserActivity.
  while (
    currentState !== null &&
    !TERMINAL_STATES.has(currentState) &&
    !DEDICATED_ACTIVITY_STATES.has(currentState) &&
    !cancelRequested
  ) {
    const browserResult: BrowserActivityResult = await browserActivity({
      runId: input.runId,
      jobId: input.jobId,
      candidateId: input.candidateId,
      jobUrl: input.jobUrl,
      state: currentState,
      data,
    });

    statesCompleted.push(currentState);
    data = { ...data, ...browserResult.data };
    mergeArtifacts(bundle, browserResult.artifacts ?? [], currentState);

    if (browserResult.outcome === "escalated") {
      currentState = StateName.ESCALATE;
      phase = "escalated";
      if (browserResult.error) {
        errors.push({
          state: currentState,
          message: browserResult.error,
          timestamp: new Date().toISOString(),
        });
      }
      return buildResult(RunOutcome.ESCALATED, currentState, statesCompleted, errors, bundle);
    }

    if (browserResult.outcome === "failure") {
      errors.push({
        state: currentState,
        message: browserResult.error ?? `State ${currentState} failed`,
        timestamp: new Date().toISOString(),
      });
      phase = "failed";
      return buildResult(RunOutcome.FAILED, currentState, statesCompleted, errors, bundle);
    }

    currentState = browserResult.nextState;
  }

  // Handle cancellation during browser loop
  if (cancelRequested) {
    phase = "cancelled";
    return buildResult(RunOutcome.CANCELLED, currentState, statesCompleted, errors, bundle);
  }

  // Handle escalation exit
  if (currentState === StateName.ESCALATE) {
    phase = "escalated";
    return buildResult(RunOutcome.ESCALATED, currentState, statesCompleted, errors, bundle);
  }

  // Handle terminal state reached (e.g. CAPTURE_CONFIRMATION without going through SUBMIT)
  if (currentState !== null && TERMINAL_STATES.has(currentState) && currentState !== StateName.CAPTURE_CONFIRMATION) {
    phase = "completed";
    return buildResult(RunOutcome.FAILED, currentState, statesCompleted, errors, bundle);
  }

  // --- Phase 3: Review gate (REVIEW_BEFORE_SUBMIT mode) ---
  if (currentState === StateName.SUBMIT && input.mode === RunMode.REVIEW_BEFORE_SUBMIT) {
    phase = "waiting_review";

    const reviewTimedOut = !(await condition(
      () => reviewResult !== undefined || cancelRequested !== undefined,
      REVIEW_TIMEOUT,
    ));

    if (cancelRequested) {
      phase = "cancelled";
      return buildResult(RunOutcome.CANCELLED, currentState, statesCompleted, errors, bundle);
    }

    if (reviewTimedOut || !reviewResult?.approved) {
      phase = "cancelled";
      return buildResult(RunOutcome.CANCELLED, currentState, statesCompleted, errors, bundle);
    }
  }

  // --- Phase 4: Submit ---
  if (currentState === StateName.SUBMIT) {
    phase = "submitting";

    const submitResult = await submitActivity({
      runId: input.runId,
      jobId: input.jobId,
      candidateId: input.candidateId,
      jobUrl: input.jobUrl,
      data,
      reviewerEdits: reviewResult?.edits,
    });

    statesCompleted.push(StateName.SUBMIT);
    data = { ...data, ...submitResult.data };
    mergeArtifacts(bundle, submitResult.artifacts ?? [], StateName.SUBMIT);

    if (!submitResult.success) {
      phase = "failed";
      errors.push({
        state: StateName.SUBMIT,
        message: submitResult.error ?? "Submit failed",
        timestamp: new Date().toISOString(),
      });
      return buildResult(RunOutcome.FAILED, StateName.SUBMIT, statesCompleted, errors, bundle);
    }

    currentState = submitResult.nextState;
  }

  // --- Phase 5: Capture confirmation ---
  if (currentState === StateName.CAPTURE_CONFIRMATION) {
    phase = "capturing";

    const captureResult = await captureActivity({
      runId: input.runId,
      jobId: input.jobId,
      candidateId: input.candidateId,
      jobUrl: input.jobUrl,
      data,
    });

    statesCompleted.push(StateName.CAPTURE_CONFIRMATION);
    mergeArtifacts(bundle, captureResult.artifacts ?? [], StateName.CAPTURE_CONFIRMATION);

    if (!captureResult.success) {
      phase = "failed";
      errors.push({
        state: StateName.CAPTURE_CONFIRMATION,
        message: captureResult.error ?? "Capture failed",
        timestamp: new Date().toISOString(),
      });
      return buildResult(RunOutcome.FAILED, StateName.CAPTURE_CONFIRMATION, statesCompleted, errors, bundle);
    }

    phase = "completed";
    return buildResult(
      RunOutcome.SUBMITTED,
      StateName.CAPTURE_CONFIRMATION,
      statesCompleted,
      errors,
      bundle,
      captureResult.confirmationId,
    );
  }

  // Fallback — should not reach here in normal flow
  phase = "failed";
  return buildResult(RunOutcome.FAILED, currentState, statesCompleted, errors, bundle);
}

function buildResult(
  outcome: RunOutcome,
  finalState: StateName | null,
  statesCompleted: StateName[],
  errors: WorkflowErrorEntry[],
  artifacts: RunArtifactBundle,
  confirmationId?: string,
): ApplyWorkflowResult {
  return {
    outcome,
    finalState,
    statesCompleted: [...statesCompleted],
    errors: [...errors],
    artifacts,
    ...(confirmationId !== undefined ? { confirmationId } : {}),
  };
}
