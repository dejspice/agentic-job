import type { AtsType } from "../enums/ats-type.js";
import type { JobStatus } from "../enums/job-status.js";

export interface Compensation {
  salary?: string;
  min?: number;
  max?: number;
  currency?: string;
  period?: "hourly" | "annual";
  equity?: string;
  bonus?: string;
}

export interface Requirements {
  yearsOfExperience?: number;
  education?: string;
  skills?: string[];
  certifications?: string[];
  clearance?: string;
  other?: string[];
}

export interface JobOpportunity {
  id: string;
  candidateId: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  atsType: AtsType;
  location: string | null;
  compensationJson: Compensation | null;
  requirementsJson: Requirements | null;
  fitScore: number | null;
  applyabilityScore: number | null;
  confidenceScore: number | null;
  status: JobStatus;
  idempotencyKey: string;
  createdAt: Date;
}
