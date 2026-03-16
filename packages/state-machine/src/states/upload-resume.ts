import { StateName } from "@dejsol/core";
import type { StateHandler, StateContext, StateResult } from "../types.js";

export const uploadResumeState: StateHandler = {
  name: StateName.UPLOAD_RESUME,

  entryCriteria:
    "Application form is loaded and a file-upload field for resume/CV has been identified.",

  successCriteria:
    "Resume file has been uploaded and the ATS has accepted it (upload indicator visible, no error banner).",

  async execute(_context: StateContext): Promise<StateResult> {
    // TODO: locate file input, upload resume via browser worker UPLOAD command
    return { outcome: "success" };
  },
};
