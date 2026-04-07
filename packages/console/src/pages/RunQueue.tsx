import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import type { RunStatus } from "../types";

interface RunQueueItem {
  id: string;
  outcome: string | null;
  currentState: string | null;
  startedAt: string;
  completedAt: string | null;
  candidateId: string;
  candidate?: { name: string; email: string };
  job?: { company: string; jobTitle: string; jobUrl: string };
}

type FilterKey = "ALL" | "SUBMITTED" | "VERIFICATION_REQUIRED" | "FAILED";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "VERIFICATION_REQUIRED", label: "Verify" },
  { key: "FAILED", label: "Failed" },
];

async function fetchRuns(outcome?: string): Promise<RunQueueItem[]> {
  try {
    const qs = outcome && outcome !== "ALL" ? `?outcome=${outcome}&pageSize=50` : "?pageSize=50";
    const res = await fetch(`/api/runs${qs}`, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RunQueueItem[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

function resolveStatus(run: RunQueueItem): RunStatus {
  if (run.outcome) return run.outcome as RunStatus;
  if (run.completedAt === null) return "IN_PROGRESS";
  return "QUEUED";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

export function RunQueue() {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [runs, setRuns] = useState<RunQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchRuns(filter === "ALL" ? undefined : filter)
      .then(setRuns)
      .finally(() => setLoading(false));
  }, [filter]);

  const submitted = runs.filter(r => r.outcome === "SUBMITTED").length;
  const verify = runs.filter(r => r.outcome === "VERIFICATION_REQUIRED").length;
  const failed = runs.filter(r => r.outcome === "FAILED").length;
  const inProgress = runs.filter(r => !r.outcome && !r.completedAt).length;

  const TH: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600,
    color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase",
    borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "12px 14px", fontSize: 13, color: "#0f172a",
    borderBottom: "1px solid #f8fafc", verticalAlign: "middle",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title="Run Queue"
        subtitle={`${runs.length} run${runs.length !== 1 ? "s" : ""}`}
      />
      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        {/* Summary counters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Submitted", count: submitted, color: "#16a34a", bg: "#dcfce7" },
            { label: "Verify", count: verify, color: "#b45309", bg: "#fef3c7" },
            { label: "Failed", count: failed, color: "#b91c1c", bg: "#fee2e2" },
            { label: "In Progress", count: inProgress, color: "#1d4ed8", bg: "#dbeafe" },
          ].map(s => (
            <div key={s.label} style={{
              flex: "1 1 0", padding: "12px 16px", borderRadius: 10,
              background: s.bg, textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 2, background: "#f1f5f9", borderRadius: 8, padding: 2, marginBottom: 16, width: "fit-content" }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: filter === f.key ? 700 : 500,
                borderRadius: 6, border: "none", cursor: "pointer",
                background: filter === f.key ? "#fff" : "transparent",
                color: filter === f.key ? "#0f172a" : "#64748b",
                boxShadow: filter === f.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Runs table */}
        <SectionCard title="" noPadding>
          {loading ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
          ) : runs.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No runs found{filter !== "ALL" ? ` with status ${filter}` : ""}. Launch a run from a candidate's detail page.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Candidate", "Company / Job", "Status", "Started", "Completed", ""].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
                    <tr key={run.id}>
                      <td style={TD}>
                        {run.candidate ? (
                          <Link to={`/candidates/${run.candidateId}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500, fontSize: 13 }}>
                            {run.candidate.name}
                          </Link>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}>{run.candidateId.slice(0, 8)}</span>
                        )}
                      </td>
                      <td style={TD}>
                        {run.job ? (
                          <>
                            <span style={{ fontWeight: 500 }}>{run.job.company}</span>
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{run.job.jobTitle}</div>
                          </>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={TD}>
                        <StatusBadge status={resolveStatus(run)} size="sm" />
                      </td>
                      <td style={{ ...TD, fontSize: 12, color: "#64748b" }}>
                        {formatTime(run.startedAt)}
                      </td>
                      <td style={{ ...TD, fontSize: 12, color: "#64748b" }}>
                        {formatTime(run.completedAt)}
                      </td>
                      <td style={TD}>
                        <Link to={`/runs/${run.id}`} style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", fontWeight: 500 }}>
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
}
