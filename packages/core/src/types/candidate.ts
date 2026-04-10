export interface CandidateProfile {
  headline?: string;
  summary?: string;
  yearsOfExperience?: number;
  skills?: string[];
  education?: Array<{
    institution: string;
    degree: string;
    field?: string;
    graduationYear?: number;
  }>;
  experience?: Array<{
    company: string;
    title: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }>;
  links?: Record<string, string>;
}

export interface AnswerBankEntry {
  question: string;
  answer: string;
  embedding?: number[];
  source: "manual" | "generated" | "captured" | "rule";
  confidence?: number;
  lastUsed?: string;
  /** Deterministic rule name that produced this answer, if source is "rule". */
  ruleName?: string;
}

export type AnswerBank = Record<string, AnswerBankEntry>;

export interface CandidatePolicies {
  maxDailyApplications?: number;
  preferredRunMode?: string;
  skipCompanies?: string[];
  skipKeywords?: string[];
  requiredKeywords?: string[];
  locationPreferences?: string[];
  salaryMinimum?: number;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  driveFolderId: string | null;
  trackingSheetId: string | null;
  profileJson: CandidateProfile;
  answerBankJson: AnswerBank;
  denylist: string[];
  policiesJson: CandidatePolicies;
  createdAt: Date;
  updatedAt: Date;
}
