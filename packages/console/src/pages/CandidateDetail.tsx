import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import type { RunStatus } from "../types";

interface CandidateProfile {
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
}

interface CandidateData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profileJson: CandidateProfile;
  createdAt: string;
  updatedAt: string;
  _count: { runs: number; jobs: number };
}

interface CandidateRun {
  id: string;
  outcome: string | null;
  currentState: string | null;
  startedAt: string;
  completedAt: string | null;
  job?: { company: string; jobTitle: string; jobUrl: string };
}

async function fetchCandidate(id: string): Promise<CandidateData> {
  const res = await fetch(`/api/candidates/${id}`, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data: CandidateData };
  return json.data;
}

async function fetchCandidateRuns(candidateId: string): Promise<CandidateRun[]> {
  try {
    const res = await fetch(`/api/candidates/${candidateId}/runs`, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: CandidateRun[] };
    return json.data ?? [];
  } catch { return []; }
}

async function updateCandidate(id: string, body: Record<string, string>): Promise<void> {
  const res = await fetch(`/api/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

async function launchRun(candidateId: string, jobUrl: string, mode: string): Promise<{ runId: string }> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: `manual-${Date.now()}`, candidateId, mode, jobUrl, atsType: "GREENHOUSE" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  return { runId: json.data.id };
}

const INPUT: React.CSSProperties = {
  padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0",
  borderRadius: 6, color: "#0f172a", background: "#ffffff",
  width: "100%", boxSizing: "border-box" as const,
};

const LABEL: React.CSSProperties = {
  fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 3,
};

// ---------------------------------------------------------------------------
// Activity Summary
// ---------------------------------------------------------------------------

function ActivitySummary({ runs, createdAt }: { runs: CandidateRun[]; createdAt: string }) {
  const total = runs.length;
  const submitted = runs.filter(r => r.outcome === "SUBMITTED").length;
  const verify = runs.filter(r => r.outcome === "VERIFICATION_REQUIRED").length;
  const failed = runs.filter(r => r.outcome === "FAILED").length;
  const successCount = submitted + verify;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

  const lastRun = runs.length > 0 ? runs[0] : null;
  const lastActivity = lastRun
    ? new Date(lastRun.completedAt ?? lastRun.startedAt).toLocaleString()
    : "No activity yet";

  const recentCompanies = runs
    .filter(r => r.job?.company)
    .map(r => r.job!.company)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, 5);

  return (
    <SectionCard title="Activity Summary">
      {/* Outcome counters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Total", n: total, color: "#0f172a", bg: "#f1f5f9" },
          { label: "Submitted", n: submitted, color: "#16a34a", bg: "#dcfce7" },
          { label: "Verify", n: verify, color: "#b45309", bg: "#fef3c7" },
          { label: "Failed", n: failed, color: "#b91c1c", bg: "#fee2e2" },
        ].map(s => (
          <div key={s.label} style={{
            flex: "1 1 0", padding: "10px 8px", borderRadius: 8,
            background: s.bg, textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.n}</div>
            <div style={{ fontSize: 10, color: s.color, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Success rate bar */}
      {total > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Success Rate</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: successRate >= 80 ? "#16a34a" : successRate >= 50 ? "#b45309" : "#b91c1c" }}>
              {successRate}%
            </span>
          </div>
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              width: `${successRate}%`, height: "100%", borderRadius: 99,
              background: successRate >= 80 ? "#22c55e" : successRate >= 50 ? "#f59e0b" : "#ef4444",
            }} />
          </div>
        </div>
      )}

      {/* Key facts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#64748b" }}>Last Activity</span>
          <span style={{ color: "#0f172a", fontWeight: 500 }}>{lastActivity}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#64748b" }}>Member Since</span>
          <span style={{ color: "#0f172a", fontWeight: 500 }}>{new Date(createdAt).toLocaleDateString()}</span>
        </div>
        {recentCompanies.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Recent Companies</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {recentCompanies.map(c => (
                <span key={c} style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 4,
                  fontSize: 11, fontWeight: 500, background: "#f1f5f9", color: "#475569",
                }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Profile Editor
// ---------------------------------------------------------------------------

function ProfileEditor({ candidate, onSaved }: { candidate: CandidateData; onSaved: () => void }) {
  const p = candidate.profileJson;
  const [form, setForm] = useState({
    firstName: p.firstName ?? candidate.name.split(" ")[0] ?? "",
    lastName: p.lastName ?? candidate.name.split(" ").slice(1).join(" ") ?? "",
    email: candidate.email,
    phone: candidate.phone ?? p.phone ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    country: p.country ?? "United States",
  });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function set(field: string, value: string) { setForm((f) => ({ ...f, [field]: value })); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      await updateCandidate(candidate.id, form);
      setBanner({ ok: true, msg: "Profile saved." });
      onSaved();
    } catch (err) {
      setBanner({ ok: false, msg: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Profile">
      {banner && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 6, fontSize: 12,
          background: banner.ok ? "#dcfce7" : "#fee2e2",
          border: `1px solid ${banner.ok ? "#bbf7d0" : "#fecaca"}`,
          color: banner.ok ? "#15803d" : "#b91c1c",
        }}>
          {banner.msg}
        </div>
      )}
      <form onSubmit={(e) => void handleSave(e)}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><label style={LABEL}>First Name</label><input style={INPUT} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
          <div><label style={LABEL}>Last Name</label><input style={INPUT} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
          <div><label style={LABEL}>Email</label><input type="email" style={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label style={LABEL}>Phone</label><input style={INPUT} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><label style={LABEL}>City</label><input style={INPUT} value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div><label style={LABEL}>State</label><input style={INPUT} value={form.state} onChange={(e) => set("state", e.target.value)} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={LABEL}>Country</label><input style={INPUT} value={form.country} onChange={(e) => set("country", e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" disabled={saving} style={{
            padding: "7px 18px", fontSize: 13, fontWeight: 600, borderRadius: 7,
            border: "none", background: saving ? "#93c5fd" : "#2563eb",
            color: "#fff", cursor: saving ? "not-allowed" : "pointer",
          }}>{saving ? "Saving…" : "Save Profile"}</button>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Launch Run Panel
// ---------------------------------------------------------------------------

function LaunchRunPanel({ candidateId, onLaunched }: { candidateId: string; onLaunched: () => void }) {
  const [jobUrl, setJobUrl] = useState("");
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; runId?: string } | null>(null);

  async function handleLaunch(e: React.FormEvent) {
    e.preventDefault();
    if (!jobUrl.trim() || !jobUrl.includes("greenhouse")) {
      setResult({ ok: false, msg: "Enter a valid Greenhouse job URL." });
      return;
    }
    setLaunching(true);
    setResult(null);
    try {
      const { runId } = await launchRun(candidateId, jobUrl.trim(), "FULL_AUTO");
      setResult({ ok: true, msg: "Run started", runId });
      setJobUrl("");
      onLaunched();
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    } finally {
      setLaunching(false);
    }
  }

  return (
    <SectionCard title="Launch Run">
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
        Start a Greenhouse application for this candidate.
      </p>
      {result && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 6, fontSize: 12,
          background: result.ok ? "#dcfce7" : "#fee2e2",
          border: `1px solid ${result.ok ? "#bbf7d0" : "#fecaca"}`,
          color: result.ok ? "#15803d" : "#b91c1c",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{result.msg}</span>
          {result.runId && (
            <Link to={`/runs/${result.runId}`} style={{ fontSize: 12, color: "#2563eb", fontWeight: 500, textDecoration: "none" }}>
              View Run →
            </Link>
          )}
        </div>
      )}
      <form onSubmit={(e) => void handleLaunch(e)} style={{ display: "flex", gap: 8 }}>
        <input
          type="url"
          placeholder="https://job-boards.greenhouse.io/company/jobs/12345"
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          style={{ ...INPUT, flex: 1 }}
        />
        <button type="submit" disabled={launching} style={{
          padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 7,
          border: "none", background: launching ? "#86efac" : "#16a34a",
          color: "#fff", cursor: launching ? "not-allowed" : "pointer", flexShrink: 0,
        }}>{launching ? "Launching…" : "Launch"}</button>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Run History Table
// ---------------------------------------------------------------------------

function resolveRunStatus(run: CandidateRun): RunStatus {
  if (run.outcome) return run.outcome as RunStatus;
  if (!run.completedAt) return "IN_PROGRESS";
  return "QUEUED";
}

function RunHistoryTable({ runs }: { runs: CandidateRun[] }) {
  const TH: React.CSSProperties = {
    padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 600,
    color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase",
    borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
  };
  const TD: React.CSSProperties = {
    padding: "10px 12px", fontSize: 12, color: "#0f172a",
    borderBottom: "1px solid #f8fafc", verticalAlign: "middle",
  };

  if (runs.length === 0) {
    return (
      <SectionCard title="Run History">
        <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 12 }}>No runs yet. Use the Launch Run panel to start one.</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={`Run History (${runs.length})`}>
      <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Company / Job", "Status", "Date", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {runs.map(run => (
              <tr key={run.id}>
                <td style={TD}>
                  {run.job ? (
                    <><span style={{ fontWeight: 500 }}>{run.job.company}</span><div style={{ fontSize: 11, color: "#64748b" }}>{run.job.jobTitle}</div></>
                  ) : <span style={{ color: "#94a3b8" }}>—</span>}
                </td>
                <td style={TD}><StatusBadge status={resolveRunStatus(run)} size="sm" /></td>
                <td style={{ ...TD, fontSize: 11, color: "#64748b" }}>{new Date(run.startedAt).toLocaleDateString()}</td>
                <td style={TD}>
                  <Link to={`/runs/${run.id}`} style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", fontWeight: 500 }}>View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CandidateDetail() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [runs, setRuns] = useState<CandidateRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function loadCandidate() {
    if (!candidateId) return;
    setLoading(true);
    fetchCandidate(candidateId)
      .then(setCandidate)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function loadRuns() {
    if (!candidateId) return;
    fetchCandidateRuns(candidateId).then(setRuns);
  }

  useEffect(() => { loadCandidate(); loadRuns(); }, [candidateId]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Topbar title="Candidate" subtitle={candidateId} />
        <main style={{ flex: 1, padding: "28px" }}>
          <div style={{ height: 200, background: "#f1f5f9", borderRadius: 12 }} />
        </main>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Topbar title="Candidate" />
        <main style={{ flex: 1, padding: "28px" }}>
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "16px 20px", fontSize: 14, color: "#c2410c" }}>
            {error ?? "Candidate not found."}{" "}
            <Link to="/candidates" style={{ color: "#2563eb" }}>← Back</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title={candidate.name}
        subtitle={candidate.email}
        actions={
          <Link to="/candidates" style={{ fontSize: 13, color: "#64748b", textDecoration: "none", padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 6 }}>
            ← Candidates
          </Link>
        }
      />
      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        {/* Activity summary — full width above the two-column layout */}
        <ActivitySummary runs={runs} createdAt={candidate.createdAt} />

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ProfileEditor candidate={candidate} onSaved={loadCandidate} />
            <RunHistoryTable runs={runs} />
          </div>

          <div style={{ width: 360, flexShrink: 0 }}>
            <LaunchRunPanel candidateId={candidate.id} onLaunched={loadRuns} />
          </div>
        </div>
      </main>
    </div>
  );
}
