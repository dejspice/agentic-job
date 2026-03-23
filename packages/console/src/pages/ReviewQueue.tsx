import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { ReviewQueueTable } from "../components/ReviewQueueTable";
import { SectionCard } from "../components/SectionCard";
import type { ReviewQueueItem, ReviewDecision, ReviewQueueStats, VerificationQueueItem } from "../types";
import { getReviewQueue, getReviewQueueStats, getVerificationQueue, approveRun, rejectRun } from "../lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWaitDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ---------------------------------------------------------------------------
// Stats mini-cards
// ---------------------------------------------------------------------------

interface QueueStatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

function QueueStatCard({ label, value, sub, color = "#0f172a" }: QueueStatCardProps) {
  return (
    <div
      style={{
        flex: "1 1 140px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "14px 18px",
      }}
    >
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </p>
      {sub && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>{sub}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function formatCompletedAt(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ReviewQueue() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [verificationItems, setVerificationItems] = useState<VerificationQueueItem[]>([]);
  const [stats, setStats] = useState<ReviewQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastDecision, setLastDecision] = useState<{
    runId: string;
    decision: ReviewDecision;
  } | null>(null);

  useEffect(() => {
    Promise.all([getReviewQueue(), getReviewQueueStats(), getVerificationQueue()]).then(
      ([queue, qstats, vqueue]) => {
        setItems(queue);
        setStats(qstats);
        setVerificationItems(vqueue);
        setLoading(false);
      },
    );
  }, []);

  function handleDecision(runId: string, decision: ReviewDecision) {
    // Fire the API call; optimistic update proceeds regardless of outcome.
    if (decision.approved) {
      approveRun(runId, {
        edits: decision.edits,
        reviewerNote: decision.reviewerNote,
      }).catch((e: Error) =>
        console.error("[ReviewQueue] approve failed:", e.message),
      );
    } else {
      rejectRun(
        runId,
        decision.reviewerNote ?? "Rejected by operator",
      ).catch((e: Error) =>
        console.error("[ReviewQueue] reject failed:", e.message),
      );
    }

    // Optimistic UI: remove item and recompute stats immediately.
    setLastDecision({ runId, decision });
    setItems((prev) => {
      const next = prev.filter((item) => item.runId !== runId);
      if (next.length === 0) {
        setStats({ totalPending: 0, avgWaitSec: 0, oldestWaitSec: 0, newestWaitSec: 0 });
      } else {
        const waits = next.map(
          (i) => (Date.now() - new Date(i.waitingSince).getTime()) / 1000,
        );
        const total = waits.reduce((a, b) => a + b, 0);
        setStats({
          totalPending: next.length,
          avgWaitSec: total / next.length,
          oldestWaitSec: Math.max(...waits),
          newestWaitSec: Math.min(...waits),
        });
      }
      return next;
    });
  }

  const urgencyColor =
    stats && stats.oldestWaitSec > 3600
      ? "#dc2626"
      : stats && stats.oldestWaitSec > 1800
      ? "#d97706"
      : "#16a34a";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title="Review Queue"
        subtitle={
          loading
            ? "Loading…"
            : `${items.length} run${items.length !== 1 ? "s" : ""} pending human review`
        }
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
              {lastDecision.decision.approved ? "approved ✓" : "rejected ✕"}.
            </span>
            <button
              onClick={() => setLastDecision(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit", padding: "0 4px" }}
            >
              ×
            </button>
          </div>
        )}

        {/* Queue stats cards */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
          <QueueStatCard
            label="Total Pending"
            value={loading ? "—" : String(stats?.totalPending ?? 0)}
            sub="runs at review gate"
            color={stats && stats.totalPending > 0 ? "#d97706" : "#16a34a"}
          />
          <QueueStatCard
            label="Avg Wait"
            value={loading || !stats ? "—" : formatWaitDuration(stats.avgWaitSec)}
            sub="across all pending runs"
          />
          <QueueStatCard
            label="Oldest Wait"
            value={loading || !stats ? "—" : formatWaitDuration(stats.oldestWaitSec)}
            sub="most urgent run"
            color={urgencyColor}
          />
          <QueueStatCard
            label="Newest Wait"
            value={loading || !stats ? "—" : formatWaitDuration(stats.newestWaitSec)}
            sub="most recent arrival"
          />
        </div>

        {/* Verification Required section */}
        {(loading || verificationItems.length > 0) && (
          <SectionCard
            title="📧 Email Verification Required"
            noPadding
            style={{ marginBottom: 24, border: "1px solid #fde68a" }}
            headerRight={
              verificationItems.length > 0 ? (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#b45309",
                    background: "#fef3c7",
                    padding: "2px 8px",
                    borderRadius: 99,
                    border: "1px solid #fde68a",
                  }}
                >
                  {verificationItems.length} awaiting code
                </span>
              ) : undefined
            }
          >
            {loading ? (
              <div style={{ padding: "20px", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
            ) : verificationItems.length === 0 ? (
              <div style={{ padding: "20px", color: "#94a3b8", fontSize: 13 }}>None pending.</div>
            ) : (
              <div>
                <div style={{ padding: "10px 16px 6px", fontSize: 12, color: "#78350f", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
                  These runs submitted successfully. Greenhouse sent a verification code to the candidate's email.
                  Open the application URL and enter the code to finalize submission.
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Company / Job", "Candidate", "Completed", "Action"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "10px 16px",
                            textAlign: "left",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#64748b",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            borderBottom: "1px solid #fde68a",
                            background: "#fffbeb",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {verificationItems.map((item) => (
                      <tr key={item.runId} style={{ borderBottom: "1px solid #fef3c7" }}>
                        <td style={{ padding: "13px 16px", fontSize: 13 }}>
                          <Link
                            to={`/runs/${item.runId}`}
                            style={{ color: "#b45309", textDecoration: "none", fontWeight: 600 }}
                          >
                            {item.company}
                          </Link>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            {item.jobTitle}
                          </div>
                        </td>
                        <td style={{ padding: "13px 16px", fontSize: 12, fontFamily: "monospace", color: "#475569" }}>
                          {item.candidateId}
                        </td>
                        <td style={{ padding: "13px 16px", fontSize: 12, color: "#78350f", fontWeight: 500 }}>
                          {formatCompletedAt(item.completedAt)}
                        </td>
                        <td style={{ padding: "13px 16px" }}>
                          <a
                            href={item.jobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "5px 12px",
                              background: "#b45309",
                              color: "#ffffff",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            Open Application →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
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
            lineHeight: 1.6,
          }}
        >
          <strong>REVIEW_BEFORE_SUBMIT mode:</strong> Runs listed here are
          paused at the review gate waiting for operator sign-off. Approve to
          proceed with form submission, or reject to cancel the run. Click a
          company name to inspect the full run detail and form data before
          deciding.
        </div>

        {/* Queue table */}
        <SectionCard
          title="Pending Review"
          noPadding
          headerRight={
            stats && stats.totalPending > 0 ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#d97706",
                  background: "#fef9c3",
                  padding: "2px 8px",
                  borderRadius: 99,
                  border: "1px solid #fde68a",
                }}
              >
                {stats.totalPending} waiting
              </span>
            ) : undefined
          }
        >
          {loading ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Loading queue…
            </div>
          ) : (
            <ReviewQueueTable items={items} onDecision={handleDecision} />
          )}
        </SectionCard>
      </main>
    </div>
  );
}
