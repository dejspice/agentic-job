import type { AtsType } from "../enums/ats-type.js";

export interface KnownFlowStep {
  pageClassifier: string;
  expectedUrl?: string;
  nextAction?: string;
}

export interface KnownFlow {
  steps?: KnownFlowStep[];
  totalPages?: number;
  hasLoginGate?: boolean;
  hasResumeUpload?: boolean;
  hasScreeningQuestions?: boolean;
}

export interface FieldMapping {
  portalFieldLabel: string;
  normalizedKey: string;
  selector: string;
  type: string;
  confidence: number;
}

export type FieldMappings = Record<string, FieldMapping>;

export interface PortalFingerprint {
  id: string;
  employerDomain: string;
  atsType: AtsType;
  knownFlowJson: KnownFlow;
  fieldMappingsJson: FieldMappings;
  avgSteps: number | null;
  avgDuration: number | null;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  challengeFrequency: number | null;
  notes: string | null;
}
