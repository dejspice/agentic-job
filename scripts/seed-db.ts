/**
 * Development seed script.
 *
 * Inserts 1 Candidate and 3 JobOpportunity records with realistic fake data.
 * Safe to re-run: candidate is upserted by fixed UUID; jobs by idempotencyKey.
 *
 * Usage:
 *   npm run db:seed
 *   # or directly:
 *   npx tsx scripts/seed-db.ts
 */

import { PrismaClient, AtsType, JobStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Fixed seed IDs ───────────────────────────────────────────────────────────

const SEED_CANDIDATE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// ─── Candidate profile (matches CandidateProfile shape from @dejsol/core) ────

const profile = {
  headline: "Senior Full-Stack Engineer · TypeScript · Node.js · React",
  summary:
    "8+ years building scalable web applications and distributed systems. " +
    "Deep experience with TypeScript/Node.js backends, React frontends, " +
    "PostgreSQL, and cloud infrastructure on AWS. Passionate about developer " +
    "tooling, observability, and high-quality engineering culture.",
  yearsOfExperience: 8,
  skills: [
    "TypeScript",
    "Node.js",
    "React",
    "PostgreSQL",
    "AWS",
    "Docker",
    "Kubernetes",
    "GraphQL",
    "Redis",
    "Python",
    "CI/CD",
    "gRPC",
  ],
  education: [
    {
      institution: "University of California, Berkeley",
      degree: "B.S.",
      field: "Computer Science",
      graduationYear: 2016,
    },
  ],
  experience: [
    {
      company: "Stripe",
      title: "Senior Software Engineer",
      startDate: "2021-03",
      current: true,
      description:
        "Tech lead for internal developer-productivity platform serving 3,000+ " +
        "engineers. Built TypeScript-first build tooling, reduced CI cycle times " +
        "by 40%, and owned production on-call rotation.",
    },
    {
      company: "Twilio",
      title: "Software Engineer",
      startDate: "2018-06",
      endDate: "2021-02",
      description:
        "Developed high-throughput messaging APIs processing 500 M+ events/day. " +
        "Designed PostgreSQL sharding strategy and led migration to Kubernetes.",
    },
    {
      company: "Accenture Federal Services",
      title: "Associate Software Developer",
      startDate: "2016-07",
      endDate: "2018-05",
      description:
        "Full-stack development on React/Node.js government portals with " +
        "WCAG 2.1 AA accessibility compliance.",
    },
  ],
  links: {
    linkedin: "https://linkedin.com/in/alexchen-dev",
    github: "https://github.com/alexchen-dev",
    portfolio: "https://alexchen.dev",
  },
};

// ─── Answer bank (matches AnswerBank shape from @dejsol/core) ─────────────────

const answerBank = {
  work_authorization: {
    question: "Are you authorized to work in the United States?",
    answer: "Yes",
    source: "manual",
    confidence: 1,
    lastUsed: "2024-01-15T00:00:00Z",
  },
  sponsorship_required: {
    question: "Will you now or in the future require visa sponsorship?",
    answer: "No",
    source: "manual",
    confidence: 1,
  },
  salary_expectation: {
    question: "What are your salary expectations?",
    answer:
      "I am targeting $160,000–$185,000 base salary depending on the total " +
      "compensation package, including equity and benefits.",
    source: "manual",
    confidence: 0.9,
    lastUsed: "2024-01-15T00:00:00Z",
  },
  years_of_experience: {
    question:
      "How many years of professional software engineering experience do you have?",
    answer: "8 years",
    source: "profile",
    confidence: 1,
  },
  remote_preference: {
    question: "Are you open to remote work?",
    answer: "Yes, I strongly prefer remote or hybrid arrangements.",
    source: "manual",
    confidence: 1,
  },
  cover_letter_intro: {
    question: "Write a brief introduction for a cover letter.",
    answer:
      "I am a senior software engineer with 8+ years of experience building " +
      "high-scale TypeScript/Node.js systems. I am particularly drawn to " +
      "companies where engineering quality and developer experience are treated " +
      "as first-class concerns.",
    source: "generated",
    confidence: 0.85,
  },
  greatest_strength: {
    question: "What is your greatest professional strength?",
    answer:
      "My ability to navigate large codebases quickly, identify systemic " +
      "bottlenecks, and deliver measurable improvements — both in the code and " +
      "in the processes around it.",
    source: "manual",
    confidence: 0.95,
    lastUsed: "2024-01-10T00:00:00Z",
  },
  why_leaving: {
    question: "Why are you looking for a new opportunity?",
    answer:
      "I am looking to join a smaller, product-focused team where I can have " +
      "broader ownership and direct impact on the product roadmap.",
    source: "manual",
    confidence: 0.9,
  },
};

// ─── Candidate policies (matches CandidatePolicies shape from @dejsol/core) ──

const policies = {
  maxDailyApplications: 10,
  preferredRunMode: "REVIEW_BEFORE_SUBMIT",
  skipCompanies: ["Meta", "Amazon", "Oracle"],
  skipKeywords: ["manager", "director", "VP", "sales", "support"],
  requiredKeywords: ["engineer", "developer", "architect"],
  locationPreferences: [
    "Remote",
    "San Francisco, CA",
    "New York, NY",
    "Seattle, WA",
  ],
  salaryMinimum: 150_000,
};

// ─── Job opportunities ─────────────────────────────────────────────────────────

const JOB_SEEDS = [
  {
    idempotencyKey: "seed-notion-sse-backend-infra-v1",
    company: "Notion",
    jobTitle: "Senior Software Engineer, Backend Infrastructure",
    jobUrl: "https://boards.greenhouse.io/notion/jobs/12345678",
    atsType: AtsType.GREENHOUSE,
    location: "Remote, US",
    compensationJson: {
      min: 160_000,
      max: 195_000,
      currency: "USD",
      period: "annual",
      equity: "0.01%–0.05% options over 4 years",
    },
    requirementsJson: {
      yearsOfExperience: 5,
      education: "B.S. in Computer Science or equivalent",
      skills: ["TypeScript", "Node.js", "PostgreSQL", "AWS", "Kubernetes"],
    },
    fitScore: 0.92,
    applyabilityScore: 0.88,
    confidenceScore: 0.85,
  },
  {
    idempotencyKey: "seed-linear-staff-swe-v1",
    company: "Linear",
    jobTitle: "Staff Software Engineer",
    jobUrl: "https://jobs.lever.co/linear/abc12345-def6-7890-abcd-ef1234567890",
    atsType: AtsType.LEVER,
    location: "Remote",
    compensationJson: {
      min: 180_000,
      max: 220_000,
      currency: "USD",
      period: "annual",
      equity: "Meaningful equity — details shared in offer",
      bonus: "Annual performance bonus",
    },
    requirementsJson: {
      yearsOfExperience: 7,
      education: "B.S. in Computer Science or equivalent",
      skills: [
        "TypeScript",
        "React",
        "Node.js",
        "distributed systems",
        "system design",
      ],
    },
    fitScore: 0.87,
    applyabilityScore: 0.91,
    confidenceScore: 0.82,
  },
  {
    idempotencyKey: "seed-vercel-swe-runtime-edge-v1",
    company: "Vercel",
    jobTitle: "Software Engineer, Runtime & Edge Infrastructure",
    jobUrl: "https://vercel.wd5.myworkdayjobs.com/vercel/job/Remote/Software-Engineer_R-00123",
    atsType: AtsType.WORKDAY,
    location: "Remote (Americas)",
    compensationJson: {
      min: 165_000,
      max: 200_000,
      currency: "USD",
      period: "annual",
      equity: "RSUs vesting over 4 years",
    },
    requirementsJson: {
      yearsOfExperience: 4,
      education: "B.S. in Computer Science or equivalent",
      skills: [
        "TypeScript",
        "Node.js",
        "Rust",
        "edge computing",
        "CDN",
        "observability",
      ],
    },
    fitScore: 0.84,
    applyabilityScore: 0.79,
    confidenceScore: 0.88,
  },
] as const;

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Seeding development database...\n");

  const candidate = await prisma.candidate.upsert({
    where: { id: SEED_CANDIDATE_ID },
    update: {
      name: "Alex Chen",
      email: "alex.chen@example.com",
      phone: "+1-415-555-0101",
      // Placeholder IDs — replace with real Google resource IDs when available.
      driveFolderId: "1ABC_PLACEHOLDER_DRIVE_FOLDER_ID",
      trackingSheetId: "1XYZ_PLACEHOLDER_TRACKING_SHEET_ID",
      profileJson: profile,
      answerBankJson: answerBank,
      policiesJson: policies,
      denylist: [],
    },
    create: {
      id: SEED_CANDIDATE_ID,
      name: "Alex Chen",
      email: "alex.chen@example.com",
      phone: "+1-415-555-0101",
      driveFolderId: "1ABC_PLACEHOLDER_DRIVE_FOLDER_ID",
      trackingSheetId: "1XYZ_PLACEHOLDER_TRACKING_SHEET_ID",
      profileJson: profile,
      answerBankJson: answerBank,
      policiesJson: policies,
      denylist: [],
    },
  });

  console.log(`[candidate] ${candidate.name} <${candidate.email}>`);
  console.log(`  id:               ${candidate.id}`);
  console.log(`  drive_folder_id:  ${candidate.driveFolderId}`);
  console.log(`  tracking_sheet_id: ${candidate.trackingSheetId}\n`);

  for (const job of JOB_SEEDS) {
    const record = await prisma.jobOpportunity.upsert({
      where: { idempotencyKey: job.idempotencyKey },
      update: {
        company: job.company,
        jobTitle: job.jobTitle,
        jobUrl: job.jobUrl,
        atsType: job.atsType,
        location: job.location,
        compensationJson: job.compensationJson,
        requirementsJson: job.requirementsJson,
        fitScore: job.fitScore,
        applyabilityScore: job.applyabilityScore,
        confidenceScore: job.confidenceScore,
        status: JobStatus.QUEUED,
      },
      create: {
        candidateId: candidate.id,
        company: job.company,
        jobTitle: job.jobTitle,
        jobUrl: job.jobUrl,
        atsType: job.atsType,
        location: job.location,
        compensationJson: job.compensationJson,
        requirementsJson: job.requirementsJson,
        fitScore: job.fitScore,
        applyabilityScore: job.applyabilityScore,
        confidenceScore: job.confidenceScore,
        status: JobStatus.QUEUED,
        idempotencyKey: job.idempotencyKey,
      },
    });

    console.log(`[job] ${record.company} — ${record.jobTitle}`);
    console.log(`  id:               ${record.id}`);
    console.log(`  ats_type:         ${record.atsType}`);
    console.log(`  status:           ${record.status}`);
    console.log(`  fit_score:        ${record.fitScore}`);
    console.log(`  idempotency_key:  ${record.idempotencyKey}\n`);
  }

  console.log("Seed complete.");
  console.log(
    "\nNote: driveFolderId and trackingSheetId are placeholder values." +
      "\nReplace them with real Google resource IDs before testing drive-connector.\n",
  );
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
