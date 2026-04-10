import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { StatusBadge } from "../components/StatusBadge";
import { RunTimeline } from "../components/RunTimeline";
import { StateName } from "../types";
import type { RunDetailView, RunStatus, ScreeningAnswerEntry, ScreeningAdjudication } from "../types";
import { getRunDetail, approveRun, rejectRun, submitVerificationCode, getRunScreeningAnswers, approveScreeningAnswers } from "../lib/api";

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
// Sub-components (local to this page)
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
// Screening Answers Review
// ---------------------------------------------------------------------------

const SOURCE_META: Record<string, { label: string; color: string; bg: string; risk: number }> = {
  rule:              { label: "Rule",       color: "#1e40af", bg: "#dbeafe", risk: 0 },
  answer_bank:       { label: "Bank",       color: "#7c2d12", bg: "#fed7aa", risk: 0 },
  llm:               { label: "LLM",        color: "#6b21a8", bg: "#ede9fe", risk: 2 },
  combobox_fallback: { label: "Fallback",   color: "#92400e", bg: "#fef3c7", risk: 1 },
  prefilled:         { label: "Prefilled",  color: "#475569", bg: "#f1f5f9", risk: 0 },
};

function answerRisk(a: ScreeningAnswerEntry): number {
  const base = SOURCE_META[a.source]?.risk ?? 0;
  const confPenalty = a.confidence < 0.8 ? 2 : a.confidence < 0.95 ? 1 : 0;
  return base + confPenalty;
}

function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_META[source] ?? { label: source, color: "#475569", bg: "#f1f5f9" };
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 4,
      fontSize: 10, fontWeight: 700, color: s.color, background: s.bg,
    }}>
      {s.label}
    </span>
  );
}

function NoveltyBadge({ source }: { source: string }) {
  if (source === "llm" || source === "combobox_fallback") {
    return (
      <span style={{
        display: "inline-block", padding: "1px 5px", borderRadius: 4,
        fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
        color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca",
      }}>
        NEW
      </span>
    );
  }
  if (source === "answer_bank") {
    return (
      <span style={{
        display: "inline-block", padding: "1px 5px", borderRadius: 4,
        fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
        color: "#16a34a", background: "#dcfce7", border: "1px solid #bbf7d0",
      }}>
        REUSED
      </span>
    );
  }
  return null;
}

function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 95 ? "#16a34a" : pct >= 80 ? "#b45309" : "#b91c1c";
  const bg = pct >= 95 ? "#dcfce7" : pct >= 80 ? "#fef3c7" : "#fee2e2";
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      fontSize: 10, fontWeight: 700, fontFamily: "monospace",
      color, background: bg,
    }}>
      {pct}%
    </span>
  );
}

const REC_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  auto_promote_to_answer_bank: { label: "Auto-promote", color: "#16a34a", bg: "#dcfce7" },
  candidate_bank_only:         { label: "Candidate only", color: "#7c2d12", bg: "#fed7aa" },
  human_review_required:       { label: "Needs review", color: "#b91c1c", bg: "#fee2e2" },
  reject:                      { label: "Reject", color: "#991b1b", bg: "#fecaca" },
  rule_candidate:              { label: "Rule candidate", color: "#1e40af", bg: "#dbeafe" },
};

function AdjudicationBadge({ adj }: { adj: ScreeningAdjudication }) {
  const s = REC_STYLE[adj.recommendation] ?? { label: adj.recommendation, color: "#475569", bg: "#f1f5f9" };
  return (
    <span title={adj.reason} style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      fontSize: 9, fontWeight: 700, color: s.color, background: s.bg,
      cursor: "help",
    }}>
      {s.label}
    </span>
  );
}

function VisibleOptionsList({ options }: { options: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 2 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        fontSize: 10, color: "#64748b", background: "none", border: "none",
        cursor: "pointer", padding: 0, textDecoration: "underline",
      }}>
        {open ? "Hide options" : `View ${options.length} options`}
      </button>
      {open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
          {options.map((o, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "1px 5px", borderRadius: 3,
              background: "#f1f5f9", color: "#475569",
            }}>{o}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScreeningAnswersSection({
  runId,
  outcome,
}: {
  runId: string;
  outcome: string | null;
}) {
  const [answers, setAnswers] = useState<ScreeningAnswerEntry[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    getRunScreeningAnswers(runId)
      .then((data) => setAnswers(data.answers))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <SectionCard title="Screening Answers">
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Loading…</p>
      </SectionCard>
    );
  }

  if (answers.length === 0) {
    return (
      <SectionCard title="Screening Answers">
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
          No screening answers recorded for this run.
        </p>
      </SectionCard>
    );
  }

  const isSuccessful = outcome === "SUBMITTED" || outcome === "VERIFICATION_REQUIRED";
  const approvable = answers.filter((a) => a.source !== "prefilled");
  const needsReview = answers.filter((a) => answerRisk(a) >= 2);
  const sorted = [...answers].sort((a, b) => answerRisk(b) - answerRisk(a));

  const srcCounts: Record<string, number> = {};
  for (const a of answers) { srcCounts[a.source] = (srcCounts[a.source] ?? 0) + 1; }
  const newCount = answers.filter(a => a.source === "llm" || a.source === "combobox_fallback").length;
  const reusedCount = answers.filter(a => a.source === "answer_bank").length;
  const safeCount = answers.filter(a => a.source === "rule" || a.source === "prefilled").length;

  function toggleExclude(idx: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleApprove() {
    setApproving(true);
    setBanner(null);
    try {
      const toApprove = approvable
        .map((a, i) => ({ a, origIdx: answers.indexOf(a), i }))
        .filter(({ origIdx }) => !excluded.has(origIdx))
        .map(({ a, origIdx }) => ({
          question: a.question,
          answer: edits[origIdx] ?? a.answer,
          source: edits[origIdx] !== undefined ? "manual" : a.source === "llm" ? "generated" : a.source,
          confidence: edits[origIdx] !== undefined ? 1.0 : a.confidence,
        }));
      if (toApprove.length === 0) {
        setBanner({ ok: false, msg: "All answers excluded — nothing to approve." });
        return;
      }
      const result = await approveScreeningAnswers(runId, toApprove);
      setBanner({ ok: true, msg: `${result.approved} answer(s) approved → bank now has ${result.bankSize} entries.` });
      setEdits({});
      setExcluded(new Set());
    } catch (e) {
      setBanner({ ok: false, msg: `Failed: ${(e as Error).message}` });
    } finally {
      setApproving(false);
    }
  }

  const includedCount = approvable.filter((_, i) => !excluded.has(answers.indexOf(approvable[i]))).length;
  const isSafeRun = newCount === 0 && answers.length > 0;
  const [detailOpen, setDetailOpen] = useState(!isSafeRun);

  return (
    <SectionCard title="Screening Answers">
      {/* Safe run banner */}
      {isSafeRun && isSuccessful && !banner && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>
              Safe run — all answers from rules or bank
            </div>
            <div style={{ fontSize: 11, color: "#16a34a", marginTop: 2 }}>
              {safeCount} safe{reusedCount > 0 ? `, ${reusedCount} reused from bank` : ""} — no LLM or fallback answers.
            </div>
          </div>
          <button
            disabled={approving || approvable.length === 0}
            onClick={() => void handleApprove()}
            style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 6,
              border: "none", background: approving ? "#86efac" : "#16a34a",
              color: "#fff", cursor: approving ? "not-allowed" : "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {approving ? "Saving…" : `Auto-approve ${approvable.length} → Bank`}
          </button>
        </div>
      )}

      {/* Source breakdown + novelty summary + review alert */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {Object.entries(srcCounts).map(([src, n]) => (
          <span key={src} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <SourceBadge source={src} />
            <span style={{ fontSize: 11, color: "#64748b" }}>×{n}</span>
          </span>
        ))}
        <span style={{ width: 1, height: 14, background: "#e2e8f0", flexShrink: 0 }} />
        {safeCount > 0 && (
          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>{safeCount} safe</span>
        )}
        {reusedCount > 0 && (
          <span style={{ fontSize: 11, color: "#7c2d12", fontWeight: 600 }}>{reusedCount} reused</span>
        )}
        {newCount > 0 && (
          <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>{newCount} new</span>
        )}
        {needsReview.length > 0 && (
          <span style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 600,
            color: "#b91c1c", background: "#fee2e2", padding: "2px 8px",
            borderRadius: 4,
          }}>
            {needsReview.length} need{needsReview.length === 1 ? "s" : ""} review
          </span>
        )}
        {isSafeRun && (
          <button onClick={() => setDetailOpen(v => !v)} style={{
            marginLeft: needsReview.length > 0 ? 0 : "auto",
            fontSize: 11, color: "#64748b", background: "none", border: "none",
            cursor: "pointer", padding: 0, textDecoration: "underline",
          }}>
            {detailOpen ? "Collapse" : "Show details"}
          </button>
        )}
      </div>

      {banner && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 6, fontSize: 12,
          background: banner.ok ? "#dcfce7" : "#fee2e2",
          border: `1px solid ${banner.ok ? "#bbf7d0" : "#fecaca"}`,
          color: banner.ok ? "#15803d" : "#b91c1c",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>{banner.msg}</span>
          <button onClick={() => setBanner(null)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, color: "inherit", padding: "0 4px",
          }}>×</button>
        </div>
      )}

      {detailOpen && <div style={{ maxHeight: 440, overflowY: "auto" }}>
        {sorted.map((a) => {
          const origIdx = answers.indexOf(a);
          const risk = answerRisk(a);
          const isExcluded = excluded.has(origIdx);
          const rowBg = isExcluded ? "#f8fafc"
            : risk >= 3 ? "#fef2f2"
            : risk >= 2 ? "#fffbeb"
            : "transparent";
          const leftBorder = risk >= 3 ? "3px solid #ef4444"
            : risk >= 2 ? "3px solid #f59e0b"
            : "3px solid transparent";

          return (
            <div key={origIdx} style={{
              padding: "10px 12px", borderBottom: "1px solid #f1f5f9",
              display: "flex", flexDirection: "column", gap: 4,
              background: rowBg, borderLeft: leftBorder,
              opacity: isExcluded ? 0.45 : 1,
              transition: "opacity 0.15s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isSuccessful && a.source !== "prefilled" && (
                  <input
                    type="checkbox"
                    checked={!isExcluded}
                    onChange={() => toggleExclude(origIdx)}
                    title={isExcluded ? "Include in approval" : "Exclude from approval"}
                    style={{ margin: 0, cursor: "pointer", accentColor: "#16a34a" }}
                  />
                )}
                <SourceBadge source={a.source} />
                <NoveltyBadge source={a.source} />
                <span style={{ fontSize: 12, color: "#64748b", flex: 1, lineHeight: 1.3 }}>
                  {a.question}
                </span>
                <ConfidencePill confidence={a.confidence} />
                {a.adjudication && <AdjudicationBadge adj={a.adjudication} />}
              </div>
              {isSuccessful && a.source !== "prefilled" ? (
                <input
                  type="text"
                  value={edits[origIdx] ?? a.answer}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [origIdx]: e.target.value }))}
                  style={{
                    fontSize: 13, padding: "5px 8px",
                    border: risk >= 2 ? "1px solid #f59e0b" : "1px solid #e2e8f0",
                    borderRadius: 6, color: "#0f172a",
                    background: edits[origIdx] !== undefined ? "#fefce8" : "#ffffff",
                    width: "100%", boxSizing: "border-box" as const,
                  }}
                />
              ) : (
                <span style={{ fontSize: 13, color: "#0f172a", paddingLeft: 2 }}>
                  {a.answer}
                </span>
              )}
              {a.adjudication && (
                <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
                  {a.adjudication.reason}
                </span>
              )}
              {a.visibleOptions && a.visibleOptions.length > 0 && (
                <VisibleOptionsList options={a.visibleOptions} />
              )}
              {a.ruleName && (
                <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                  rule: {a.ruleName}
                </span>
              )}
            </div>
          );
        })}
      </div>}

      {detailOpen && isSuccessful && approvable.length > 0 && !isSafeRun && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            disabled={approving || includedCount === 0}
            onClick={() => void handleApprove()}
            style={{
              flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600,
              borderRadius: 7, border: "none",
              background: approving || includedCount === 0 ? "#d1d5db" : "#16a34a",
              color: "#ffffff", cursor: approving || includedCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {approving ? "Saving…" : `Approve ${includedCount} Answer(s) → Bank`}
          </button>
          {excluded.size > 0 && (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              {excluded.size} excluded
            </span>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<RunDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decisionBanner, setDecisionBanner] = useState<{
    approved: boolean;
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyBanner, setVerifyBanner] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    setFetchError(null);
    getRunDetail(runId)
      .then(setRun)
      .catch((e: Error) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  // --- Loading state ---
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Topbar title="Run Detail" subtitle={runId} />
        <main style={{ flex: 1, padding: "28px" }}>
          <div style={{ display: "flex", gap: 20 }}>
            {[1, 2].map((i) => (
              <div
                key={i}
                style={{
                  flex: i === 1 ? 1 : undefined,
                  width: i === 2 ? 320 : undefined,
                  height: 280,
                  background: "#f1f5f9",
                  borderRadius: 12,
                }}
              />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // --- Error / not found state ---
  if (fetchError || !run) {
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
            {fetchError
              ? `Error loading run ${runId}: ${fetchError}`
              : `Run ${runId} not found.`}{" "}
            <Link to="/" style={{ color: "#2563eb" }}>
              ← Back to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const status = resolveStatus(run);

  async function handleApprove() {
    if (!runId || deciding) return;
    setDeciding(true);
    try {
      await approveRun(runId);
      setDecisionBanner({ approved: true });
      // Refresh run state after approval signal is sent
      getRunDetail(runId).then(setRun).catch(console.error);
    } catch (e) {
      console.error("[RunDetail] approve failed:", e);
    } finally {
      setDeciding(false);
    }
  }

  async function handleReject() {
    if (!runId || deciding) return;
    const note = window.prompt(
      "Rejection note (required — leave blank for default):",
      "",
    );
    if (note === null) return; // operator cancelled the prompt
    setDeciding(true);
    try {
      await rejectRun(runId, note || "Rejected by operator");
      setDecisionBanner({ approved: false });
      // Refresh run state after rejection signal is sent
      getRunDetail(runId).then(setRun).catch(console.error);
    } catch (e) {
      console.error("[RunDetail] reject failed:", e);
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title={
          run.company && run.jobTitle
            ? `${run.company} — ${run.jobTitle}`
            : `Run ${run.id}`
        }
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
        {/* Decision feedback banner */}
        {decisionBanner && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              background: decisionBanner.approved ? "#dcfce7" : "#fee2e2",
              border: `1px solid ${decisionBanner.approved ? "#bbf7d0" : "#fecaca"}`,
              borderRadius: 8,
              fontSize: 13,
              color: decisionBanner.approved ? "#15803d" : "#b91c1c",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              Run <strong>{run.id}</strong> was{" "}
              {decisionBanner.approved ? "approved ✓" : "rejected ✕"}.
              {decisionBanner.approved
                ? " The workflow will proceed to submission."
                : " The run has been cancelled."}
            </span>
            <button
              onClick={() => setDecisionBanner(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: "inherit",
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Left column: summary + cost + errors */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Run Summary */}
            <SectionCard title="Run Summary">
              <KVRow label="Status" value={<StatusBadge status={status} />} />
              <KVRow label="Mode" value={run.mode} />
              <KVRow label="Candidate" value={run.candidateId} />
              {run.jobUrl && run.jobUrl !== "" && (
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
              )}
              <KVRow
                label="Current State"
                value={
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {run.currentState ?? "—"}
                  </span>
                }
              />
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
                    <span
                      style={{
                        fontFamily: "monospace",
                        color: "#16a34a",
                        fontWeight: 600,
                      }}
                    >
                      {run.confirmationId}
                    </span>
                  }
                />
              )}
            </SectionCard>

            {/* Cost & Telemetry */}
            <SectionCard title="Cost &amp; Telemetry">
              <KVRow
                label="Input tokens"
                value={run.cost.inputTokens?.toLocaleString() ?? "—"}
              />
              <KVRow
                label="Output tokens"
                value={run.cost.outputTokens?.toLocaleString() ?? "—"}
              />
              <KVRow label="LLM calls" value={run.cost.llmCalls ?? "—"} />
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
                    <span
                      style={{
                        fontFamily: "monospace",
                        color: "#991b1b",
                        fontWeight: 600,
                      }}
                    >
                      {err.state}
                    </span>
                    <span style={{ color: "#7f1d1d", marginLeft: 8 }}>
                      {err.message}
                    </span>
                  </div>
                ))}
              </SectionCard>
            )}

            {/* Screening Answers — review + approve */}
            {runId && <ScreeningAnswersSection runId={runId} outcome={run.outcome} />}
          </div>

          {/* Right column: timeline + action panel + artifacts */}
          <div style={{ width: 320, flexShrink: 0 }}>
            {/* State Timeline */}
            <SectionCard title="State Timeline">
              {run.stateHistory.length > 0 ? (
                <RunTimeline entries={run.stateHistory} />
              ) : (
                <p
                  style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}
                >
                  No state history yet.
                </p>
              )}
            </SectionCard>

            {/* Email Verification Required action panel */}
            {status === "VERIFICATION_REQUIRED" && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "2px solid #f59e0b",
                  borderRadius: 12,
                  padding: "16px 20px",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#92400e",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  📧 Email Verification Required
                </div>

                {/* Code entry banner */}
                {verifyBanner && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: "8px 12px",
                      background: verifyBanner.ok ? "#dcfce7" : "#fee2e2",
                      border: `1px solid ${verifyBanner.ok ? "#bbf7d0" : "#fecaca"}`,
                      borderRadius: 6,
                      fontSize: 12,
                      color: verifyBanner.ok ? "#15803d" : "#b91c1c",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{verifyBanner.msg}</span>
                    <button
                      onClick={() => setVerifyBanner(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "inherit", padding: "0 4px" }}
                    >×</button>
                  </div>
                )}

                <p style={{ margin: "0 0 12px", fontSize: 12, color: "#78350f", lineHeight: 1.6 }}>
                  Greenhouse submitted the application but challenged it with
                  an 8-character security code sent to the candidate's email.
                  Check the inbox, then enter the code below to complete submission.
                </p>

                {/* Code input + submit */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Enter 8-character code"
                    maxLength={10}
                    value={verificationCode}
                    onChange={(e) =>
                      setVerificationCode(e.target.value.trim().toUpperCase())
                    }
                    style={{
                      flex: 1,
                      padding: "7px 12px",
                      fontSize: 14,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      letterSpacing: "0.15em",
                      border: "1px solid #f59e0b",
                      borderRadius: 7,
                      background: "#ffffff",
                      color: "#92400e",
                      outline: "none",
                    }}
                  />
                  <button
                    disabled={verifySubmitting || verificationCode.length < 4}
                    onClick={async () => {
                      if (!runId || verifySubmitting) return;
                      setVerifySubmitting(true);
                      try {
                        const result = await submitVerificationCode(
                          runId,
                          verificationCode,
                        );
                        setVerifyBanner({
                          ok: true,
                          msg: result.signalSent
                            ? "✓ Code sent to workflow — submission in progress."
                            : "✓ Code received. Open the job URL to enter it manually.",
                        });
                        setVerificationCode("");
                        getRunDetail(runId).then(setRun).catch(console.error);
                      } catch (e) {
                        setVerifyBanner({
                          ok: false,
                          msg: `Failed to submit code: ${(e as Error).message}`,
                        });
                      } finally {
                        setVerifySubmitting(false);
                      }
                    }}
                    style={{
                      padding: "7px 16px",
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: 7,
                      border: "none",
                      background:
                        verifySubmitting || verificationCode.length < 4
                          ? "#fde68a"
                          : "#b45309",
                      color: "#ffffff",
                      cursor:
                        verifySubmitting || verificationCode.length < 4
                          ? "not-allowed"
                          : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {verifySubmitting ? "Sending…" : "Submit Code"}
                  </button>
                </div>

                {run.jobUrl && (
                  <a
                    href={run.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      background: "transparent",
                      color: "#b45309",
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: "none",
                      border: "1px solid #f59e0b",
                    }}
                  >
                    Open Application URL →
                  </a>
                )}
              </div>
            )}

            {/* Awaiting Review action panel */}
            {status === "REVIEW" && !decisionBanner && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: 12,
                  padding: "16px 20px",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#92400e",
                    marginBottom: 8,
                  }}
                >
                  ⏸ Awaiting Review
                </div>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "#78350f" }}>
                  This run is paused at the review gate. Approve to proceed with
                  form submission, or reject to cancel.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    disabled={deciding}
                    onClick={() => void handleApprove()}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 7,
                      border: "none",
                      background: deciding ? "#86efac" : "#16a34a",
                      color: "#ffffff",
                      cursor: deciding ? "not-allowed" : "pointer",
                    }}
                  >
                    {deciding ? "…" : "Approve"}
                  </button>
                  <button
                    disabled={deciding}
                    onClick={() => void handleReject()}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 7,
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                      color: deciding ? "#fca5a5" : "#dc2626",
                      cursor: deciding ? "not-allowed" : "pointer",
                    }}
                  >
                    {deciding ? "…" : "Reject"}
                  </button>
                </div>
              </div>
            )}

            {/* Artifacts */}
            {(run.artifacts.screenshots ||
              run.artifacts.confirmationScreenshot ||
              run.artifacts.domSnapshots ||
              run.artifacts.harFile) && (
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
                  Object.entries(run.artifacts.screenshots).map(
                    ([state, url]) => (
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
                    ),
                  )}
                {run.artifacts.harFile && (
                  <div style={{ marginBottom: 8 }}>
                    <a
                      href={run.artifacts.harFile}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "#2563eb" }}
                    >
                      🗂 HAR file
                    </a>
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
