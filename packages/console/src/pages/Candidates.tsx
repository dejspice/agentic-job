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

export function Candidates() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCandidates()
      .then(setCandidates)
      .finally(() => setLoading(false));
  }, []);

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
      />
      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        <SectionCard title="All Candidates" noPadding>
          {loading ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Loading…
            </div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No candidates registered yet. Candidates are created when their first run is started via the API or Temporal workflow.
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
