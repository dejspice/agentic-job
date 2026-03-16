import { Link } from "react-router-dom";
import type { ReviewQueueItem, ReviewDecision } from "../types";

interface ReviewQueueTableProps {
  items: ReviewQueueItem[];
  onDecision?: (runId: string, decision: ReviewDecision) => void;
}

function formatWaitTime(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const TH_STYLE: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#64748b",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  borderBottom: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
};

const TD_STYLE: React.CSSProperties = {
  padding: "14px 16px",
  fontSize: 13,
  color: "#0f172a",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

export function ReviewQueueTable({ items, onDecision }: ReviewQueueTableProps) {
  if (items.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 0",
          color: "#94a3b8",
          fontSize: 14,
        }}
      >
        No items pending review.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "#ffffff",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr>
            <th style={TH_STYLE}>Company / Job</th>
            <th style={TH_STYLE}>Candidate</th>
            <th style={TH_STYLE}>Current State</th>
            <th style={TH_STYLE}>Mode</th>
            <th style={TH_STYLE}>Waiting</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.runId}>
              <td style={TD_STYLE}>
                <Link
                  to={`/runs/${item.runId}`}
                  style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
                >
                  {item.company}
                </Link>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {item.jobTitle}
                </div>
              </td>
              <td style={{ ...TD_STYLE, fontFamily: "monospace", fontSize: 12 }}>
                {item.candidateId}
              </td>
              <td style={TD_STYLE}>
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
                  {item.currentState ?? "—"}
                </span>
              </td>
              <td style={TD_STYLE}>
                <span style={{ fontSize: 12, color: "#64748b" }}>{item.mode}</span>
              </td>
              <td style={{ ...TD_STYLE, color: "#d97706", fontWeight: 500 }}>
                {formatWaitTime(item.waitingSince)}
              </td>
              <td style={TD_STYLE}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() =>
                      onDecision?.(item.runId, { approved: true })
                    }
                    style={{
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: "none",
                      background: "#16a34a",
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      onDecision?.(item.runId, { approved: false })
                    }
                    style={{
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                      color: "#dc2626",
                      cursor: "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
