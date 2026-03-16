import { useState } from "react";
import { Topbar } from "../components/Topbar";
import { ReviewQueueTable } from "../components/ReviewQueueTable";
import { RunMode, StateName } from "../types";
import type { ReviewQueueItem, ReviewDecision } from "../types";

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const MOCK_QUEUE: ReviewQueueItem[] = [
  {
    runId: "run-004",
    jobId: "job-004",
    candidateId: "cand-003",
    company: "Umbrella LLC",
    jobTitle: "Backend Engineer",
    jobUrl: "https://jobs.umbrella.com/456",
    currentState: StateName.SUBMIT,
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    waitingSince: new Date(Date.now() - 5_400_000).toISOString(),
  },
  {
    runId: "run-005",
    jobId: "job-005",
    candidateId: "cand-001",
    company: "Initech Systems",
    jobTitle: "Staff Engineer",
    jobUrl: "https://jobs.initech.com/789",
    currentState: StateName.PRE_SUBMIT_CHECK,
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    waitingSince: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    runId: "run-006",
    jobId: "job-006",
    candidateId: "cand-002",
    company: "Nakatomi Corp",
    jobTitle: "Platform Engineer",
    jobUrl: "https://jobs.nakatomi.com/321",
    currentState: StateName.SUBMIT,
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    waitingSince: new Date(Date.now() - 300_000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewQueue() {
  const [items, setItems] = useState<ReviewQueueItem[]>(MOCK_QUEUE);
  const [lastDecision, setLastDecision] = useState<{
    runId: string;
    decision: ReviewDecision;
  } | null>(null);

  function handleDecision(runId: string, decision: ReviewDecision) {
    // In production: POST /api/runs/:runId/review with the decision body.
    setLastDecision({ runId, decision });
    // Remove from queue optimistically.
    setItems((prev) => prev.filter((item) => item.runId !== runId));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title="Review Queue"
        subtitle={`${items.length} run${items.length !== 1 ? "s" : ""} pending human review`}
      />

      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        {/* Decision feedback banner */}
        {lastDecision && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              background: lastDecision.decision.approved ? "#dcfce7" : "#fee2e2",
              border: `1px solid ${lastDecision.decision.approved ? "#bbf7d0" : "#fecaca"}`,
              borderRadius: 8,
              fontSize: 13,
              color: lastDecision.decision.approved ? "#15803d" : "#b91c1c",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              Run <strong>{lastDecision.runId}</strong> was{" "}
              {lastDecision.decision.approved ? "approved" : "rejected"}.
            </span>
            <button
              onClick={() => setLastDecision(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: "inherit",
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Info callout */}
        <div
          style={{
            padding: "12px 16px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            fontSize: 13,
            color: "#1e40af",
            marginBottom: 24,
          }}
        >
          <strong>REVIEW_BEFORE_SUBMIT mode:</strong> Runs listed here are paused
          at the review gate. Approve to proceed with submission, or reject to
          cancel the run. Click a company name to view the full run detail.
        </div>

        {/* Queue table */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <ReviewQueueTable items={items} onDecision={handleDecision} />
        </div>
      </main>
    </div>
  );
}
