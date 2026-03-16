import { Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { RunMode, RunOutcome, StateName } from "../types";
import type { DashboardMetric, RunSummary, RunStatus } from "../types";

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const MOCK_METRICS: DashboardMetric[] = [
  { id: "total-runs",      label: "Total Runs",       value: 142,  trend: "up",      delta: 12 },
  { id: "submitted",       label: "Submitted Today",  value: 18,   trend: "up",      delta: 5  },
  { id: "success-rate",    label: "Success Rate",     value: "84%", trend: "neutral"             },
  { id: "pending-review",  label: "Pending Review",   value: 4,    trend: "down",    delta: -2  },
  { id: "avg-duration",    label: "Avg Duration",     value: "3.2", unit: "min",     trend: "down", delta: -8 },
  { id: "escalated",       label: "Escalated",        value: 3,    trend: "up",      delta: 1  },
];

const MOCK_RECENT_RUNS: RunSummary[] = [
  {
    id: "run-001",
    jobId: "job-001",
    jobTitle: "Senior Software Engineer",
    company: "Acme Corp",
    candidateId: "cand-001",
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    outcome: null,
    currentState: StateName.PRE_SUBMIT_CHECK,
    percentComplete: 78,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 900_000).toISOString(),
    completedAt: null,
  },
  {
    id: "run-002",
    jobId: "job-002",
    jobTitle: "Product Designer",
    company: "Globex Inc",
    candidateId: "cand-001",
    mode: RunMode.FULL_AUTO,
    outcome: RunOutcome.SUBMITTED,
    currentState: StateName.CAPTURE_CONFIRMATION,
    percentComplete: 100,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    completedAt: new Date(Date.now() - 3_200_000).toISOString(),
  },
  {
    id: "run-003",
    jobId: "job-003",
    jobTitle: "Data Engineer",
    company: "Initech",
    candidateId: "cand-002",
    mode: RunMode.FULL_AUTO,
    outcome: RunOutcome.FAILED,
    currentState: StateName.FILL_REQUIRED_FIELDS,
    percentComplete: 50,
    humanInterventions: 1,
    startedAt: new Date(Date.now() - 7_200_000).toISOString(),
    completedAt: new Date(Date.now() - 7_100_000).toISOString(),
  },
  {
    id: "run-004",
    jobId: "job-004",
    jobTitle: "Backend Engineer",
    company: "Umbrella LLC",
    candidateId: "cand-003",
    mode: RunMode.REVIEW_BEFORE_SUBMIT,
    outcome: null,
    currentState: StateName.SUBMIT,
    percentComplete: 85,
    humanInterventions: 0,
    startedAt: new Date(Date.now() - 5_400_000).toISOString(),
    completedAt: null,
  },
];

function runStatus(run: RunSummary): RunStatus {
  if (run.outcome) return run.outcome as RunStatus;
  if (run.currentState === StateName.SUBMIT) return "REVIEW";
  if (run.completedAt === null) return "IN_PROGRESS";
  return "QUEUED";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SECTION_TITLE_STYLE: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
};

export function Dashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Dashboard" subtitle="System-wide apply workflow metrics" />

      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        {/* KPI grid */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={SECTION_TITLE_STYLE}>Key Metrics</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {MOCK_METRICS.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        </section>

        {/* Recent runs */}
        <section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ ...SECTION_TITLE_STYLE, margin: 0 }}>Recent Runs</h2>
            <Link
              to="/review"
              style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
            >
              View review queue →
            </Link>
          </div>

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Run", "Company / Job", "Mode", "State", "Progress", "Status", ""].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          textAlign: "left",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#64748b",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {MOCK_RECENT_RUNS.map((run) => (
                  <tr key={run.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      {run.id}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                        {run.company}
                      </span>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {run.jobTitle}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      {run.mode}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          background: "#f1f5f9",
                          padding: "2px 6px",
                          borderRadius: 4,
                          color: "#475569",
                        }}
                      >
                        {run.currentState ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minWidth: 100,
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
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
                        <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
                          {run.percentComplete}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <StatusBadge status={runStatus(run)} size="sm" />
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <Link
                        to={`/runs/${run.id}`}
                        style={{
                          fontSize: 12,
                          color: "#2563eb",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
