import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { submitVerificationCode } from "../lib/api";
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
  errorLogJson?: Array<{ state: string; message: string }>;
}

type FilterKey = "ALL" | "ACTION_NEEDED" | "SUBMITTED" | "VERIFICATION_REQUIRED" | "FAILED" | "SKIPPED";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTION_NEEDED", label: "Action Needed" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "VERIFICATION_REQUIRED", label: "Verify" },
  { key: "FAILED", label: "Failed" },
  { key: "SKIPPED", label: "Skipped" },
];

async function fetchRuns(outcome?: string): Promise<RunQueueItem[]> {
  try {
    const qs = outcome ? `?outcome=${outcome}&pageSize=50` : "?pageSize=50";
    const res = await fetch(`/api/runs${qs}`, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RunQueueItem[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function fetchActionNeeded(): Promise<RunQueueItem[]> {
  const [verify, failed] = await Promise.all([
    fetchRuns("VERIFICATION_REQUIRED"),
    fetchRuns("FAILED"),
  ]);
  return [...verify, ...failed].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
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

function InlineVerifyCode({ runId, onDone }: { runId: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit() {
    if (code.length < 4 || sending) return;
    setSending(true);
    try {
      const res = await submitVerificationCode(runId, code);
      setResult({ ok: true, msg: res.signalSent ? "Code sent to workflow" : "Code received" });
      setCode("");
      setTimeout(onDone, 1500);
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  if (result) {
    return (
      <span style={{ fontSize: 11, color: result.ok ? "#16a34a" : "#b91c1c", fontWeight: 600 }}>
        {result.ok ? "✓" : "✗"} {result.msg}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input
        type="text"
        placeholder="Code"
        maxLength={10}
        value={code}
        onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
        style={{
          width: 80, padding: "3px 6px", fontSize: 12, fontFamily: "monospace",
          fontWeight: 700, letterSpacing: "0.1em", border: "1px solid #f59e0b",
          borderRadius: 5, background: "#fff", color: "#92400e",
        }}
      />
      <button
        disabled={sending || code.length < 4}
        onClick={() => void handleSubmit()}
        style={{
          padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5,
          border: "none", cursor: sending || code.length < 4 ? "not-allowed" : "pointer",
          background: sending || code.length < 4 ? "#fde68a" : "#b45309", color: "#fff",
        }}
      >
        {sending ? "…" : "Verify"}
      </button>
    </div>
  );
}

function FailedInfo({ run }: { run: RunQueueItem }) {
  const errors = run.errorLogJson ?? [];
  const lastError = errors.length > 0 ? errors[errors.length - 1] : null;
  return (
    <div style={{ fontSize: 11, lineHeight: 1.4 }}>
      <span style={{ fontFamily: "monospace", color: "#991b1b", fontWeight: 600 }}>
        {run.currentState ?? "UNKNOWN"}
      </span>
      {lastError && (
        <div style={{ color: "#b91c1c", marginTop: 2 }}>
          {lastError.message.length > 80 ? lastError.message.slice(0, 80) + "…" : lastError.message}
        </div>
      )}
    </div>
  );
}

export function RunQueue() {
  const [filter, setFilter] = useState<FilterKey>("ACTION_NEEDED");
  const [runs, setRuns] = useState<RunQueueItem[]>([]);
  const [allRuns, setAllRuns] = useState<RunQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    const fetchFn = filter === "ACTION_NEEDED"
      ? fetchActionNeeded()
      : fetchRuns(filter === "ALL" ? undefined : filter);
    fetchFn.then(setRuns).finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, [filter]);

  useEffect(() => {
    fetchRuns().then(setAllRuns);
  }, []);

  const submitted = allRuns.filter(r => r.outcome === "SUBMITTED").length;
  const verify = allRuns.filter(r => r.outcome === "VERIFICATION_REQUIRED").length;
  const failed = allRuns.filter(r => r.outcome === "FAILED").length;
  const inProgress = allRuns.filter(r => !r.outcome && !r.completedAt).length;
  const actionNeeded = verify + failed;

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
        subtitle={actionNeeded > 0 ? `${actionNeeded} need${actionNeeded === 1 ? "s" : ""} action` : "All clear"}
      />
      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        {/* Summary counters — clickable */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Action Needed", count: actionNeeded, color: "#b91c1c", bg: "#fee2e2", filter: "ACTION_NEEDED" as FilterKey },
            { label: "Submitted", count: submitted, color: "#16a34a", bg: "#dcfce7", filter: "SUBMITTED" as FilterKey },
            { label: "Verify", count: verify, color: "#b45309", bg: "#fef3c7", filter: "VERIFICATION_REQUIRED" as FilterKey },
            { label: "Failed", count: failed, color: "#b91c1c", bg: "#fee2e2", filter: "FAILED" as FilterKey },
            { label: "In Progress", count: inProgress, color: "#1d4ed8", bg: "#dbeafe", filter: "ALL" as FilterKey },
          ].map(s => (
            <button key={s.label} onClick={() => setFilter(s.filter)} style={{
              flex: "1 1 0", padding: "12px 16px", borderRadius: 10,
              background: s.bg, textAlign: "center", border: filter === s.filter ? `2px solid ${s.color}` : "2px solid transparent",
              cursor: "pointer",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{s.label}</div>
            </button>
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
              {f.label}{f.key === "ACTION_NEEDED" && actionNeeded > 0 ? ` (${actionNeeded})` : ""}
            </button>
          ))}
        </div>

        {/* Runs table */}
        <SectionCard title="" noPadding>
          {loading ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
          ) : runs.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 13 }}>
              {filter === "ACTION_NEEDED" ? (
                <span style={{ color: "#16a34a" }}>No runs need action right now.</span>
              ) : (
                <span style={{ color: "#94a3b8" }}>No runs found{filter !== "ALL" ? ` with status ${filter}` : ""}.</span>
              )}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Candidate", "Company / Job", "Status", "Info / Action", "Time", ""].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
                    <tr key={run.id} style={{
                      background: run.outcome === "VERIFICATION_REQUIRED" ? "#fffbeb"
                        : run.outcome === "FAILED" ? "#fef2f2" : undefined,
                    }}>
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
                      <td style={{ ...TD, minWidth: 200 }}>
                        {run.outcome === "VERIFICATION_REQUIRED" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <InlineVerifyCode runId={run.id} onDone={refresh} />
                            {run.job?.jobUrl && (
                              <a href={run.job.jobUrl} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 10, color: "#b45309", textDecoration: "none", fontWeight: 600 }}>
                                Open →
                              </a>
                            )}
                          </div>
                        ) : run.outcome === "FAILED" ? (
                          <FailedInfo run={run} />
                        ) : run.outcome === "SUBMITTED" ? (
                          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 500 }}>Complete</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#64748b" }}>—</span>
                        )}
                      </td>
                      <td style={{ ...TD, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                        {formatTime(run.completedAt ?? run.startedAt)}
                      </td>
                      <td style={TD}>
                        <Link to={`/runs/${run.id}`} style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", fontWeight: 500 }}>
                          Detail →
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
