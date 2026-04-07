import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { SectionCard } from "../components/SectionCard";

interface CandidateSummary {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
}

async function getCandidates(): Promise<CandidateSummary[]> {
  try {
    const res = await fetch("/api/candidates?pageSize=50", {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: CandidateSummary[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function createCandidate(body: {
  firstName: string; lastName: string; email: string;
  phone?: string; city?: string; state?: string; country?: string;
}): Promise<CandidateSummary | null> {
  const res = await fetch("/api/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: CandidateSummary };
  return json.data ?? null;
}

const INPUT: React.CSSProperties = {
  padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0",
  borderRadius: 6, color: "#0f172a", background: "#ffffff",
  width: "100%", boxSizing: "border-box" as const,
};

function CreateCandidateForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    city: "", state: "", country: "United States",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("First name, last name, and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCandidate(form);
      setForm({ firstName: "", lastName: "", email: "", phone: "", city: "", state: "", country: "United States" });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "8px 16px", fontSize: 13, fontWeight: 600,
          borderRadius: 7, border: "none", background: "#2563eb",
          color: "#fff", cursor: "pointer",
        }}
      >
        + New Candidate
      </button>
    );
  }

  return (
    <SectionCard title="New Candidate">
      <form onSubmit={(e) => void handleSubmit(e)}>
        {error && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#b91c1c" }}>
            {error}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>First Name *</label><input style={INPUT} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
          <div><label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Last Name *</label><input style={INPUT} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
          <div><label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Email *</label><input type="email" style={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Phone</label><input style={INPUT} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>City</label><input style={INPUT} value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div><label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>State</label><input style={INPUT} value={form.state} onChange={(e) => set("state", e.target.value)} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Country</label><input style={INPUT} value={form.country} onChange={(e) => set("country", e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => setOpen(false)} style={{ padding: "7px 14px", fontSize: 13, fontWeight: 500, borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: "none", background: saving ? "#93c5fd" : "#2563eb", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Creating…" : "Create Candidate"}</button>
        </div>
      </form>
    </SectionCard>
  );
}

export function Candidates() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    getCandidates()
      .then(setCandidates)
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  const TH: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600,
    color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase",
    borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "13px 14px", fontSize: 13, color: "#0f172a",
    borderBottom: "1px solid #f8fafc", verticalAlign: "middle",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title="Candidates"
        subtitle="Beta users registered in the system"
        actions={<CreateCandidateForm onCreated={refresh} />}
      />
      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        <SectionCard title={`All Candidates (${candidates.length})`} noPadding>
          {loading ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Loading…
            </div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No candidates yet. Click <strong>+ New Candidate</strong> above to add one.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Name", "Email", "Phone", "Registered", ""].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map(c => (
                    <tr key={c.id}>
                      <td style={{ ...TD, fontWeight: 500 }}>{c.name}</td>
                      <td style={{ ...TD, color: "#2563eb" }}>{c.email}</td>
                      <td style={{ ...TD, color: "#64748b", fontSize: 12 }}>{c.phone ?? "—"}</td>
                      <td style={{ ...TD, color: "#64748b", fontSize: 12 }}>
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td style={TD}>
                        <Link
                          to={`/candidates/${c.id}`}
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
          )}
        </SectionCard>
      </main>
    </div>
  );
}
