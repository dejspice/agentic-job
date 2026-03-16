import { AtsType } from "@dejsol/core";
import type { AtsAccelerator } from "@dejsol/core";
import { leverClassifiers, classifyLeverPage, isLeverUrl } from "./classifier.js";
import { leverFormSchemas, getLeverField, getLeverFormSchema } from "./schema.js";
import { leverPathTemplates, viaJobListingFlow, directApplyFlow } from "./paths.js";
import { leverEdgeCasesJson, leverEdgeCases, getLeverEdgeCase } from "./edge-cases.js";

export const LEVER_ACCELERATOR_VERSION = 1;

/**
 * The assembled Lever accelerator, conforming to the AtsAccelerator shape.
 * This is the production entry point for deterministic Lever knowledge.
 */
export const leverAccelerator: AtsAccelerator = {
  id: "lever-v1",
  atsType: AtsType.LEVER,
  version: LEVER_ACCELERATOR_VERSION,
  pageClassifiersJson: leverClassifiers,
  formSchemaJson: leverFormSchemas,
  pathTemplatesJson: leverPathTemplates,
  edgeCasesJson: leverEdgeCasesJson,
  successRate: null,
  lastValidated: null,
};

export {
  leverClassifiers,
  classifyLeverPage,
  isLeverUrl,
} from "./classifier.js";

export {
  leverFormSchemas,
  personalInfoFields,
  locationField,
  resumeField,
  additionalInfoField,
  linkFields,
  eeoFields,
  getLeverField,
  getLeverFormSchema,
} from "./schema.js";

export {
  leverPathTemplates,
  viaJobListingFlow,
  directApplyFlow,
} from "./paths.js";

export {
  leverEdgeCases,
  leverEdgeCasesJson,
  getLeverEdgeCase,
  type LeverEdgeCase,
} from "./edge-cases.js";
