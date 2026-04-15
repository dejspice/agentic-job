import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

/**
 * Greenhouse resume upload selectors in priority order.
 *
 * Covers the canonical id*="resume" pattern, name*="resume", id*="cv",
 * name*="cv", class*="resume", and a last-resort generic file input.
 *
 * The selector priority loop tries each specific selector with a short
 * (200 ms) WAIT_FOR check, then uploads with the first present selector.
 * The generic 'input[type="file"]' fallback is last resort only.
 */
const GREENHOUSE_RESUME_SELECTORS: readonly string[] = [
  'input[type="file"][id*="resume"]',
  'input[type="file"][name*="resume"]',
  'input[type="file"][id*="cv"]',
  'input[type="file"][name*="cv"]',
  'input[type="file"][class*="resume"]',
  'input[type="file"]',
];

/**
 * Selectors that indicate a resume file was successfully uploaded.
 * Greenhouse replaces the upload buttons with a file name display.
 */
const GREENHOUSE_UPLOAD_CONFIRMATION_SELECTORS: readonly string[] = [
  '.chosen-file',
  '[data-file-name]',
  '.uploaded-filename',
  '.attachment-filename',
  'a[download]',
];

export const uploadResumeState: StateHandler = {
  name: StateName.UPLOAD_RESUME,

  entryCriteria:
    "Application form is loaded and a file-upload field for resume/CV has been identified.",

  successCriteria:
    "Resume file has been uploaded and the ATS has accepted it (upload indicator visible, no error banner).",

  async execute(context: StateContext): Promise<StateResult> {
    if (!context.execute) {
      return { outcome: "success" };
    }

    const resumePath = context.data.resumeFile as string | undefined;
    if (!resumePath) {
      return {
        outcome: "failure",
        error: "No resume file path in context.data.resumeFile",
      };
    }

    // Step 1: Wait for any resume/file input to appear (ensures the form loaded).
    const combinedSelector = GREENHOUSE_RESUME_SELECTORS.join(", ");
    const waitResult = await context.execute({
      type: "WAIT_FOR",
      target: combinedSelector,
      timeoutMs: 5000,
    });

    if (!waitResult.success) {
      if (context.captureArtifact) {
        const ref = await context.captureArtifact("screenshot", "upload-resume-input-not-found");
        context.data.artifacts = context.data.artifacts ?? [];
        (context.data.artifacts as unknown[]).push(ref);
      }
      return { outcome: "failure", error: "Resume file input not found" };
    }

    // Step 2: Resolve the best matching specific selector via fast presence checks.
    let resolvedSelector = GREENHOUSE_RESUME_SELECTORS[GREENHOUSE_RESUME_SELECTORS.length - 1]!;

    for (const sel of GREENHOUSE_RESUME_SELECTORS.slice(0, -1)) {
      const checkResult = await context.execute({
        type: "WAIT_FOR",
        target: sel,
        timeoutMs: 200,
      });
      if (checkResult.success) {
        resolvedSelector = sel;
        break;
      }
    }

    // Step 3: Upload via the filechooser pattern (ported from apply_agent.py).
    // Click the Resume section's "Attach" button → intercept the native file
    // dialog → set the file.  This is the only approach that reliably registers
    // uploads on React-managed Greenhouse boards.  Falls back to direct
    // setInputFiles if no trigger button is found.
    const triggerSelector = '[aria-labelledby="upload-label-resume"] button:has-text("Attach")';
    const triggerCheck = await context.execute({
      type: "WAIT_FOR",
      target: triggerSelector,
      timeoutMs: 2000,
    });

    const uploadResult = await context.execute({
      type: "UPLOAD",
      selector: resolvedSelector,
      filePath: resumePath,
      ...(triggerCheck.success ? { triggerSelector } : {}),
    });

    if (!uploadResult.success) {
      if (context.captureArtifact) {
        const ref = await context.captureArtifact("screenshot", "upload-resume-failed");
        context.data.artifacts = context.data.artifacts ?? [];
        (context.data.artifacts as unknown[]).push(ref);
      }
      return {
        outcome: "failure",
        error: uploadResult.error ?? "Resume upload failed",
      };
    }

    // Step 4: Verify the upload was processed by the ATS (Greenhouse replaces
    // upload buttons with a file name display when successful).
    const confirmationSelector = GREENHOUSE_UPLOAD_CONFIRMATION_SELECTORS.join(", ");
    const confirmResult = await context.execute({
      type: "WAIT_FOR",
      target: confirmationSelector,
      timeoutMs: 5000,
    });
    if (!confirmResult.success) {
      context.data.uploadConfirmationMissing = true;
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("screenshot", "upload-resume-success");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    context.data.resumeUploaded = true;
    context.data.resumeSelectorUsed = resolvedSelector;

    // ── Cover letter: upload resume as fallback if field is required ──
    // Some Greenhouse boards mark cover letter as required (aria-required
    // on the file-upload group).  Use the resume file as a stand-in to
    // avoid a validation rejection on submit.
    await uploadCoverLetterIfRequired(context, resumePath);

    return { outcome: "success" };
  },
};

// ---------------------------------------------------------------------------
// Cover letter upload helper
// ---------------------------------------------------------------------------

const COVER_LETTER_SELECTORS: readonly string[] = [
  'input[type="file"]#cover_letter',
  'input[type="file"][id*="cover_letter"]',
  'input[type="file"][name*="cover_letter"]',
];

async function uploadCoverLetterIfRequired(
  context: StateContext,
  resumePath: string,
): Promise<void> {
  if (!context.execute) return;

  const requiredCheck = await context.execute({
    type: "WAIT_FOR",
    target: '[aria-labelledby="upload-label-cover_letter"][aria-required="true"]',
    timeoutMs: 500,
  });
  if (!requiredCheck.success) return;

  let clSelector: string | undefined;
  for (const sel of COVER_LETTER_SELECTORS) {
    const check = await context.execute({
      type: "WAIT_FOR", target: sel, timeoutMs: 300,
    });
    if (check.success) { clSelector = sel; break; }
  }
  if (!clSelector) return;

  const triggerSelector =
    '[aria-labelledby="upload-label-cover_letter"] button:has-text("Attach")';
  const triggerCheck = await context.execute({
    type: "WAIT_FOR", target: triggerSelector, timeoutMs: 1000,
  });

  const uploadResult = await context.execute({
    type: "UPLOAD",
    selector: clSelector,
    filePath: resumePath,
    ...(triggerCheck.success ? { triggerSelector } : {}),
  });

  if (uploadResult.success) {
    context.data.coverLetterUploaded = true;
  }
}
