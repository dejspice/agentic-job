-- CreateEnum
CREATE TYPE "AtsType" AS ENUM ('WORKDAY', 'GREENHOUSE', 'LEVER', 'ASHBY', 'ICIMS', 'SMARTRECRUITERS', 'TALEO', 'SAP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'REVIEW', 'SUBMITTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('FULL_AUTO', 'REVIEW_BEFORE_SUBMIT', 'HUMAN_TAKEOVER');

-- CreateEnum
CREATE TYPE "RunOutcome" AS ENUM ('SUBMITTED', 'VERIFICATION_REQUIRED', 'FAILED', 'ESCALATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "drive_folder_id" TEXT,
    "tracking_sheet_id" TEXT,
    "profile_json" JSONB NOT NULL,
    "answer_bank_json" JSONB NOT NULL DEFAULT '{}',
    "denylist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policies_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_opportunities" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "job_url" TEXT NOT NULL,
    "ats_type" "AtsType" NOT NULL,
    "location" TEXT,
    "compensation_json" JSONB,
    "requirements_json" JSONB,
    "fit_score" DOUBLE PRECISION,
    "applyability_score" DOUBLE PRECISION,
    "confidence_score" DOUBLE PRECISION,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apply_runs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "mode" "RunMode" NOT NULL,
    "runtime_provider" TEXT,
    "resume_file" TEXT,
    "current_state" TEXT,
    "state_history_json" JSONB NOT NULL DEFAULT '[]',
    "answers_json" JSONB NOT NULL DEFAULT '{}',
    "error_log_json" JSONB NOT NULL DEFAULT '[]',
    "artifact_urls_json" JSONB NOT NULL DEFAULT '{}',
    "confirmation_id" TEXT,
    "outcome" "RunOutcome",
    "human_interventions" INTEGER NOT NULL DEFAULT 0,
    "cost_json" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "apply_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ats_accelerators" (
    "id" TEXT NOT NULL,
    "ats_type" "AtsType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "page_classifiers_json" JSONB NOT NULL,
    "form_schema_json" JSONB NOT NULL,
    "path_templates_json" JSONB NOT NULL,
    "edge_cases_json" JSONB NOT NULL DEFAULT '{}',
    "success_rate" DOUBLE PRECISION,
    "last_validated" TIMESTAMP(3),

    CONSTRAINT "ats_accelerators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_fingerprints" (
    "id" TEXT NOT NULL,
    "employer_domain" TEXT NOT NULL,
    "ats_type" "AtsType" NOT NULL,
    "known_flow_json" JSONB NOT NULL DEFAULT '{}',
    "field_mappings_json" JSONB NOT NULL DEFAULT '{}',
    "avg_steps" INTEGER,
    "avg_duration" INTEGER,
    "last_success" TIMESTAMP(3),
    "last_failure" TIMESTAMP(3),
    "challenge_frequency" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "portal_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_opportunities_idempotency_key_key" ON "job_opportunities"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ats_accelerators_ats_type_key" ON "ats_accelerators"("ats_type");

-- CreateIndex
CREATE UNIQUE INDEX "portal_fingerprints_employer_domain_ats_type_key" ON "portal_fingerprints"("employer_domain", "ats_type");

-- AddForeignKey
ALTER TABLE "job_opportunities" ADD CONSTRAINT "job_opportunities_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_runs" ADD CONSTRAINT "apply_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_runs" ADD CONSTRAINT "apply_runs_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
