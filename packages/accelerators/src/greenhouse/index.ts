import { AtsType } from "@dejsol/core";
import type { AtsAccelerator } from "@dejsol/core";
import { greenhouseClassifiers, classifyGreenhousePage, isGreenhouseUrl } from "./classifier.js";
import { greenhouseFormSchemas, getGreenhouseField, getGreenhouseFormSchema } from "./schema.js";
import { greenhousePathTemplates, singlePageFlow, multiStepFlow } from "./paths.js";
import { greenhouseEdgeCasesJson, greenhouseEdgeCases, getGreenhouseEdgeCase } from "./edge-cases.js";

export const GREENHOUSE_ACCELERATOR_VERSION = 1;

/**
 * The assembled Greenhouse accelerator, conforming to the AtsAccelerator shape.
 * This is the production entry point for deterministic Greenhouse knowledge.
 */
export const greenhouseAccelerator: AtsAccelerator = {
  id: "greenhouse-v1",
  atsType: AtsType.GREENHOUSE,
  version: GREENHOUSE_ACCELERATOR_VERSION,
  pageClassifiersJson: greenhouseClassifiers,
  formSchemaJson: greenhouseFormSchemas,
  pathTemplatesJson: greenhousePathTemplates,
  edgeCasesJson: greenhouseEdgeCasesJson,
  successRate: null,
  lastValidated: null,
};

export {
  greenhouseClassifiers,
  classifyGreenhousePage,
  isGreenhouseUrl,
} from "./classifier.js";

export {
  greenhouseFormSchemas,
  personalInfoFields,
  documentFields,
  linkFields,
  eeocFields,
  getGreenhouseField,
  getGreenhouseFormSchema,
} from "./schema.js";

export {
  greenhousePathTemplates,
  singlePageFlow,
  multiStepFlow,
} from "./paths.js";

export {
  greenhouseEdgeCases,
  greenhouseEdgeCasesJson,
  getGreenhouseEdgeCase,
  type GreenhouseEdgeCase,
} from "./edge-cases.js";
