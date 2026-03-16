import { useParams, Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { StatusBadge } from "../components/StatusBadge";
import { RunTimeline } from "../components/RunTimeline";
import { RunMode, RunOutcome, StateName } from "../types";
import type { RunDetailView, RunStatus } from "../types";

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const MOCK_RUNS: Record<string, RunDetailView> = {
  "run-001": {
    id: "run-001",
    jobId: "job-001",
    jobTitle: "Senior Software Engineer",
    company: "Acme Corp",
    jobUrl: "https://jobs.acme.com/123",
    candidateId: "cand-001",
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    outcome: null,
    currentState: StateName.PRE_SUBMIT_CHECK,
    percentComplete: 78,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 900_000).toISOString(),
    completedAt: null,
    confirmationId: null,
    errors: [],
    stateHistory: [
      {
        state: StateName.INIT,
        enteredAt: new Date(Date.now() - 900_000).toISOString(),
        exitedAt: new Date(Date.now() - 895_000).toISOString(),
        outcome: "success",
        durationMs: 5000,
      },
      {
        state: StateName.OPEN_JOB_PAGE,
        enteredAt: new Date(Date.now() - 895_000).toISOString(),
        exitedAt: new Date(Date.now() - 880_000).toISOString(),
        outcome: "success",
        durationMs: 15_000,
      },
      {
        state: StateName.DETECT_APPLY_ENTRY,
        enteredAt: new Date(Date.now() - 880_000).toISOString(),
        exitedAt: new Date(Date.now() - 870_000).toISOString(),
        outcome: "success",
        durationMs: 10_000,
      },
      {
        state: StateName.UPLOAD_RESUME,
        enteredAt: new Date(Date.now() - 870_000).toISOString(),
        exitedAt: new Date(Date.now() - 840_000).toISOString(),
        outcome: "success",
        durationMs: 30_000,
      },
      {
        state: StateName.FILL_REQUIRED_FIELDS,
        enteredAt: new Date(Date.now() - 840_000).toISOString(),
        exitedAt: new Date(Date.now() - 800_000).toISOString(),
        outcome: "success",
        durationMs: 40_000,
      },
      {
        state: StateName.PRE_SUBMIT_CHECK,
        enteredAt: new Date(Date.now() - 800_000).toISOString(),
        outcome: "success",
        durationMs: undefined,
      },
    ],
    artifacts: {
      screenshots: {
        PRE_SUBMIT_CHECK: "https://storage.example.com/run-001/pre-submit.png",
      },
    },
    cost: {
      inputTokens: 4200,
      outputTokens: 800,
      llmCalls: 6,
      totalLatencyMs: 61_000,
      estimatedCostUsd: 0.04,
    },
  },
  "run-002": {
    id: "run-002",
    jobId: "job-002",
    jobTitle: "Product Designer",
    company: "Globex Inc",
    jobUrl: "https://jobs.globex.com/456",
    candidateId: "cand-001",
    mode: RunMode.FULL_AUTO,
    outcome: RunOutcome.SUBMITTED,
    currentState: StateName.CAPTURE_CONFIRMATION,
    percentComplete: 100,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    completedAt: new Date(Date.now() - 3_200_000).toISOString(),
    confirmationId: "APP-2025-78421",
    errors: [],
    stateHistory: [
      {
        state: StateName.INIT,
        enteredAt: new Date(Date.now() - 3_600_000).toISOString(),
        exitedAt: new Date(Date.now() - 3_595_000).toISOString(),
        outcome: "success",
        durationMs: 5000,
      },
      {
        state: StateName.SUBMIT,
        enteredAt: new Date(Date.now() - 3_215_000).toISOString(),
        exitedAt: new Date(Date.now() - 3_210_000).toISOString(),
        outcome: "success",
        durationMs: 5000,
      },
      {
        state: StateName.CAPTURE_CONFIRMATION,
        enteredAt: new Date(Date.now() - 3_210_000).toISOString(),
        exitedAt: new Date(Date.now() - 3_200_000).toISOString(),
        outcome: "success",
        durationMs: 10_000,
      },
    ],
    artifacts: {
      confirmationScreenshot:
        "https://storage.example.com/run-002/confirmation.png",
    },
    cost: {
      inputTokens: 8100,
      outputTokens: 1400,
      llmCalls: 11,
      totalLatencyMs: 400_000,
      estimatedCostUsd: 0.09,
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveStatus(run: RunDetailView): RunStatus {
  if (run.outcome) return run.outcome as RunStatus;
  if (run.currentState === StateName.SUBMIT) return "REVIEW";
  return "IN_PROGRESS";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        marginBottom: 20,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #f1f5f9",
          fontSize: 13,
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid #f8fafc",
        fontSize: 13,
      }}
    >
      <span style={{ color: "#64748b", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#0f172a" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const run = runId ? MOCK_RUNS[runId] : undefined;

  if (!run) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Topbar title="Run Detail" />
        <main style={{ flex: 1, padding: "28px" }}>
          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 8,
              padding: "16px 20px",
              fontSize: 14,
              color: "#c2410c",
            }}
          >
            Run <strong>{runId}</strong> not found.{" "}
            <Link to="/" style={{ color: "#2563eb" }}>
              ← Back to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const status = resolveStatus(run);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title={`${run.company} — ${run.jobTitle}`}
        subtitle={`Run ${run.id}`}
        actions={
          <Link
            to="/"
            style={{
              fontSize: 13,
              color: "#64748b",
              textDecoration: "none",
              padding: "6px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
            }}
          >
            ← Dashboard
          </Link>
        }
      />

      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Left column: summary + timeline */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Summary card */}
            <SectionCard title="Run Summary">
              <KVRow label="Status" value={<StatusBadge status={status} />} />
              <KVRow label="Mode" value={run.mode} />
              <KVRow label="Candidate" value={run.candidateId} />
              <KVRow
                label="Job URL"
                value={
                  <a
                    href={run.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb", fontSize: 12 }}
                  >
                    {run.jobUrl}
                  </a>
                }
              />
              <KVRow label="Current State" value={
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {run.currentState ?? "—"}
                </span>
              } />
              <KVRow
                label="Progress"
                value={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 80,
                        height: 6,
                        background: "#e2e8f0",
                        borderRadius: 99,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${run.percentComplete}%`,
                          height: "100%",
                          background: "#3b82f6",
                          borderRadius: 99,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      {run.percentComplete}%
                    </span>
                  </div>
                }
              />
              <KVRow label="Started" value={formatDate(run.startedAt)} />
              <KVRow label="Completed" value={formatDate(run.completedAt)} />
              {run.confirmationId && (
                <KVRow
                  label="Confirmation ID"
                  value={
                    <span style={{ fontFamily: "monospace", color: "#16a34a", fontWeight: 600 }}>
                      {run.confirmationId}
                    </span>
                  }
                />
              )}
            </SectionCard>

            {/* Cost card */}
            <SectionCard title="Cost &amp; Telemetry">
              <KVRow label="Input tokens"     value={run.cost.inputTokens?.toLocaleString() ?? "—"} />
              <KVRow label="Output tokens"    value={run.cost.outputTokens?.toLocaleString() ?? "—"} />
              <KVRow label="LLM calls"        value={run.cost.llmCalls ?? "—"} />
              <KVRow
                label="Total latency"
                value={
                  run.cost.totalLatencyMs
                    ? `${(run.cost.totalLatencyMs / 1000).toFixed(1)}s`
                    : "—"
                }
              />
              <KVRow
                label="Est. cost"
                value={
                  run.cost.estimatedCostUsd !== undefined
                    ? `$${run.cost.estimatedCostUsd.toFixed(4)}`
                    : "—"
                }
              />
            </SectionCard>

            {/* Error log */}
            {run.errors.length > 0 && (
              <SectionCard title="Error Log">
                {run.errors.map((err, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px 12px",
                      background: "#fee2e2",
                      borderRadius: 6,
                      marginBottom: 8,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontFamily: "monospace", color: "#991b1b", fontWeight: 600 }}>
                      {err.state}
                    </span>
                    <span style={{ color: "#7f1d1d", marginLeft: 8 }}>{err.message}</span>
                  </div>
                ))}
              </SectionCard>
            )}
          </div>

          {/* Right column: timeline + action panel */}
          <div style={{ width: 320, flexShrink: 0 }}>
            {/* State timeline */}
            <SectionCard title="State Timeline">
              <RunTimeline entries={run.stateHistory} />
            </SectionCard>

            {/* Action panel — review gate */}
            {status === "REVIEW" && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: 12,
                  padding: "16px 20px",
                }}
              >
                <div
                  style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8 }}
                >
                  ⏸ Awaiting Review
                </div>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "#78350f" }}>
                  This run is paused at the review gate. Approve to proceed with
                  form submission, or reject to cancel.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 7,
                      border: "none",
                      background: "#16a34a",
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      // TODO: POST /api/runs/:runId/review { approved: true }
                      alert(`Approved run ${run.id} — API integration pending`);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 7,
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                      color: "#dc2626",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      // TODO: POST /api/runs/:runId/review { approved: false }
                      alert(`Rejected run ${run.id} — API integration pending`);
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {/* Artifacts */}
            {(run.artifacts.screenshots || run.artifacts.confirmationScreenshot) && (
              <SectionCard title="Artifacts">
                {run.artifacts.confirmationScreenshot && (
                  <div style={{ marginBottom: 8 }}>
                    <a
                      href={run.artifacts.confirmationScreenshot}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "#2563eb" }}
                    >
                      📸 Confirmation screenshot
                    </a>
                  </div>
                )}
                {run.artifacts.screenshots &&
                  Object.entries(run.artifacts.screenshots).map(([state, url]) => (
                    <div key={state} style={{ marginBottom: 8 }}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "#2563eb" }}
                      >
                        📸 {state}
                      </a>
                    </div>
                  ))}
              </SectionCard>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
