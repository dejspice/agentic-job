import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { SectionCard } from "../components/SectionCard";
import { TrendPill } from "../components/TrendPill";
import { StateName } from "../types";
import type { KpiSnapshot, KpiPeriod, RunSummary, RunStatus, DashboardMetric } from "../types";
import { getKpiSnapshot, getRecentRuns } from "../lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runStatus(run: RunSummary): RunStatus {
  if (run.outcome) return run.outcome as RunStatus;
  if (run.currentState === StateName.SUBMIT) return "REVIEW";
  if (run.completedAt === null) return "IN_PROGRESS";
  return "QUEUED";
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "running";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/** Map a KpiSnapshot to the four primary DashboardMetric cards. */
function primaryKpis(kpi: KpiSnapshot): DashboardMetric[] {
  return [
    {
      id: "success-rate",
      label: "Success Rate",
      value: kpi.successRate.formatted,
      delta: kpi.successRate.delta,
      accent: "#16a34a",
      description: `${kpi.submittedRuns.current} of ${kpi.totalRuns.current} runs submitted`,
    },
    {
      id: "hitl-rate",
      label: "HITL Rate",
      value: kpi.hitlRate.formatted,
      delta: kpi.hitlRate.delta,
      invertDelta: true,
      accent: "#d97706",
      description: "Runs requiring human intervention",
    },
    {
      id: "llm-cost",
      label: "LLM Cost",
      value: kpi.llmCostUsd.formatted,
      delta: kpi.llmCostUsd.delta,
      invertDelta: true,
      accent: "#7c3aed",
      description: "Estimated total this period",
    },
    {
      id: "deterministic-rate",
      label: "Deterministic Rate",
      value: kpi.deterministicRate.formatted,
      delta: kpi.deterministicRate.delta,
      accent: "#2563eb",
      description: "Fields resolved without LLM inference",
    },
  ];
}

/** Map a KpiSnapshot to the three secondary volume metric cards. */
function volumeKpis(kpi: KpiSnapshot): DashboardMetric[] {
  return [
    {
      id: "total-runs",
      label: "Total Runs",
      value: kpi.totalRuns.formatted,
      delta: kpi.totalRuns.delta,
    },
    {
      id: "avg-duration",
      label: "Avg Duration",
      value: kpi.avgRunDurationSec.formatted,
      delta: kpi.avgRunDurationSec.delta,
      invertDelta: true,
    },
    {
      id: "pending-review",
      label: "Pending Review",
      value: kpi.reviewPendingCount,
      description: "REVIEW_BEFORE_SUBMIT runs at the gate",
    },
  ];
}

// ---------------------------------------------------------------------------
// Period picker
// ---------------------------------------------------------------------------

interface PeriodPickerProps {
  value: KpiPeriod;
  onChange: (p: KpiPeriod) => void;
}

const PERIODS: { value: KpiPeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d",  label: "7 d" },
  { value: "30d", label: "30 d" },
];

function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  return (
    <div
      style={{
        display: "flex",
        background: "#f1f5f9",
        borderRadius: 8,
        padding: 2,
        gap: 2,
      }}
    >
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          style={{
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: p.value === value ? 700 : 500,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            background: p.value === value ? "#ffffff" : "transparent",
            color: p.value === value ? "#0f172a" : "#64748b",
            boxShadow: p.value === value ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.1s",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent runs table
// ---------------------------------------------------------------------------

function RecentRunsTable({ runs }: { runs: RunSummary[] }) {
  const TH: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "13px 14px",
    fontSize: 13,
    color: "#0f172a",
    borderBottom: "1px solid #f8fafc",
    verticalAlign: "middle",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Run ID", "Company / Job", "Mode", "State", "Progress", "Status", "Duration", ""].map(
              (h) => <th key={h} style={TH}>{h}</th>,
            )}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} style={{ borderBottom: "1px solid #f8fafc" }}>
              <td style={{ ...TD, fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>
                {run.id}
              </td>
              <td style={TD}>
                <span style={{ fontWeight: 500 }}>{run.company}</span>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {run.jobTitle}
                </div>
              </td>
              <td style={{ ...TD, fontSize: 11, color: "#64748b" }}>{run.mode}</td>
              <td style={TD}>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    background: "#f1f5f9",
                    padding: "2px 6px",
                    borderRadius: 4,
                    color: "#475569",
                  }}
                >
                  {run.currentState ?? "—"}
                </span>
              </td>
              <td style={TD}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 90 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      background: "#e2e8f0",
                      borderRadius: 99,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${run.percentComplete}%`,
                        height: "100%",
                        background:
                          run.outcome === "FAILED"
                            ? "#ef4444"
                            : run.outcome === "SUBMITTED"
                            ? "#22c55e"
                            : "#3b82f6",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>
                    {run.percentComplete}%
                  </span>
                </div>
              </td>
              <td style={TD}>
                <StatusBadge status={runStatus(run)} size="sm" />
              </td>
              <td style={{ ...TD, fontSize: 12, color: "#64748b" }}>
                {formatDuration(run.startedAt, run.completedAt)}
              </td>
              <td style={TD}>
                <Link
                  to={`/runs/${run.id}`}
                  style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review queue mini-panel
// ---------------------------------------------------------------------------

function ReviewMiniPanel({ kpi }: { kpi: KpiSnapshot }) {
  const pending = kpi.reviewPendingCount;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: pending > 0 ? "#d97706" : "#16a34a",
              lineHeight: 1,
            }}
          >
            {pending}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            runs waiting
          </div>
        </div>

        <div
          style={{
            width: 1,
            height: 36,
            background: "#e2e8f0",
            flexShrink: 0,
          }}
        />

        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>REVIEW_BEFORE_SUBMIT</span> runs are
          paused at the review gate waiting for operator approval.
        </div>
      </div>

      <Link
        to="/review"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          background: pending > 0 ? "#d97706" : "#2563eb",
          color: "#ffffff",
          borderRadius: 7,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          flexShrink: 0,
        }}
      >
        {pending > 0 ? `Review ${pending} run${pending !== 1 ? "s" : ""} →` : "Open queue →"}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function KpiSkeleton() {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            flex: "1 1 200px",
            height: 110,
            background: "#f1f5f9",
            borderRadius: 12,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Dashboard() {
  const [period, setPeriod] = useState<KpiPeriod>("7d");
  const [kpi, setKpi] = useState<KpiSnapshot | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getKpiSnapshot(period), getRecentRuns(8)]).then(
      ([snapshot, recentRuns]) => {
        setKpi(snapshot);
        setRuns(recentRuns);
        setLoading(false);
      },
    );
  }, [period]);

  const primary = kpi ? primaryKpis(kpi) : [];
  const volume  = kpi ? volumeKpis(kpi)  : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title="Dashboard"
        subtitle="System-wide apply workflow metrics"
        actions={
          <PeriodPicker value={period} onChange={setPeriod} />
        }
      />

      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>

        {/* ── Primary KPI grid ──────────────────────────────────────── */}
        <section style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: "#0f172a",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Core KPIs
            </h2>
            {kpi && (
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                vs previous {period} period
              </span>
            )}
          </div>
          {loading || !kpi ? (
            <KpiSkeleton />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {primary.map((m) => (
                <MetricCard key={m.id} metric={m} />
              ))}
            </div>
          )}
        </section>

        {/* ── Volume metrics ────────────────────────────────────────── */}
        <section style={{ marginBottom: 28 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Volume
          </h2>
          {loading || !kpi ? (
            <div style={{ display: "flex", gap: 16 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{ flex: "1 1 180px", height: 90, background: "#f1f5f9", borderRadius: 12 }}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {volume.map((m) => (
                <MetricCard key={m.id} metric={m} />
              ))}
            </div>
          )}
        </section>

        {/* ── Review queue mini-panel ───────────────────────────────── */}
        <section style={{ marginBottom: 28 }}>
          <SectionCard
            title="Review Gate"
            headerRight={
              kpi && kpi.reviewPendingCount > 0 ? (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#d97706",
                    background: "#fef9c3",
                    padding: "2px 8px",
                    borderRadius: 99,
                  }}
                >
                  {kpi.reviewPendingCount} pending
                </span>
              ) : undefined
            }
          >
            {kpi ? (
              <ReviewMiniPanel kpi={kpi} />
            ) : (
              <div style={{ height: 60, background: "#f1f5f9", borderRadius: 8 }} />
            )}
          </SectionCard>
        </section>

        {/* ── Outcome breakdown ─────────────────────────────────────── */}
        {kpi && (
          <section style={{ marginBottom: 28 }}>
            <SectionCard title="Outcome Breakdown">
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[
                  {
                    label: "Submitted",
                    count: kpi.submittedRuns.current,
                    total: kpi.totalRuns.current,
                    color: "#16a34a",
                  },
                  {
                    label: "Failed",
                    count: kpi.failedRuns.current,
                    total: kpi.totalRuns.current,
                    color: "#dc2626",
                  },
                  {
                    label: "Cancelled / Escalated",
                    count:
                      kpi.totalRuns.current -
                      kpi.submittedRuns.current -
                      kpi.failedRuns.current,
                    total: kpi.totalRuns.current,
                    color: "#7c3aed",
                  },
                ].map(({ label, count, total, color }) => {
                  const pct =
                    total === 0 ? 0 : Math.round((count / total) * 100);
                  return (
                    <div
                      key={label}
                      style={{ flex: "1 1 160px", minWidth: 160 }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                          {label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>
                          {count}
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>
                            {" "}({pct}%)
                          </span>
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: "#e2e8f0",
                          borderRadius: 99,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: color,
                            borderRadius: 99,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: 4,
                        }}
                      >
                        {kpi[
                          label === "Submitted"
                            ? "submittedRuns"
                            : label === "Failed"
                            ? "failedRuns"
                            : "totalRuns"
                        ].delta !== undefined &&
                          label !== "Cancelled / Escalated" && (
                            <TrendPill
                              delta={
                                (label === "Submitted"
                                  ? kpi.submittedRuns
                                  : kpi.failedRuns
                                ).delta!
                              }
                              invertPolarity={label === "Failed"}
                            />
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </section>
        )}

        {/* ── Recent runs ───────────────────────────────────────────── */}
        <section>
          <SectionCard
            title="Recent Runs"
            noPadding
            headerRight={
              <Link
                to="/review"
                style={{
                  fontSize: 12,
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Review queue →
              </Link>
            }
          >
            {runs.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                No recent runs.
              </div>
            ) : (
              <RecentRunsTable runs={runs} />
            )}
          </SectionCard>
        </section>
      </main>
    </div>
  );
}
