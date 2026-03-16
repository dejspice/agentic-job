import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

const GREENHOUSE_RESUME_SELECTOR = 'input[type="file"][id*="resume"], input[type="file"]';

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
      return { outcome: "failure", error: "No resume file path in context.data.resumeFile" };
    }

    const waitResult = await context.execute({
      type: "WAIT_FOR",
      target: GREENHOUSE_RESUME_SELECTOR,
      timeoutMs: 5000,
    });
    if (!waitResult.success) {
      return { outcome: "failure", error: "Resume file input not found" };
    }

    const uploadResult = await context.execute({
      type: "UPLOAD",
      selector: GREENHOUSE_RESUME_SELECTOR.split(",")[0].trim(),
      filePath: resumePath,
    });
    if (!uploadResult.success) {
      return { outcome: "failure", error: uploadResult.error ?? "Resume upload failed" };
    }

    if (context.captureArtifact) {
      const ref = await context.captureArtifact("screenshot", "upload-resume");
      context.data.artifacts = context.data.artifacts ?? [];
      (context.data.artifacts as unknown[]).push(ref);
    }

    context.data.resumeUploaded = true;
    return { outcome: "success" };
  },
};
