import type { AtsType } from "../enums/ats-type.js";

export interface PageClassifier {
  name: string;
  selectors: string[];
  urlPatterns?: string[];
  textPatterns?: string[];
  confidence: number;
}

export interface FormFieldSchema {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "select" | "checkbox" | "radio" | "textarea" | "file" | "date" | "number";
  required: boolean;
  selector: string;
  options?: string[];
  mapTo?: string;
}

export interface FormSchema {
  pageType: string;
  fields: FormFieldSchema[];
}

export interface PathTemplate {
  name: string;
  steps: Array<{
    state: string;
    expectedUrl?: string;
    expectedClassifier?: string;
    actions: Array<{
      type: string;
      target?: string;
      value?: string;
    }>;
  }>;
}

export interface AtsAccelerator {
  id: string;
  atsType: AtsType;
  version: number;
  pageClassifiersJson: PageClassifier[];
  formSchemaJson: FormSchema[];
  pathTemplatesJson: PathTemplate[];
  edgeCasesJson: Record<string, unknown>;
  successRate: number | null;
  lastValidated: Date | null;
}
