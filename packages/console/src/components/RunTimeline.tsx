import type { StateHistoryEntry } from "../types";

interface RunTimelineProps {
  entries: StateHistoryEntry[];
}

const OUTCOME_COLORS: Record<StateHistoryEntry["outcome"], string> = {
  success:   "#16a34a",
  failure:   "#dc2626",
  skipped:   "#94a3b8",
  escalated: "#7e22ce",
};

const OUTCOME_BG: Record<StateHistoryEntry["outcome"], string> = {
  success:   "#dcfce7",
  failure:   "#fee2e2",
  skipped:   "#f1f5f9",
  escalated: "#f3e8ff",
};

function formatDuration(ms?: number): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function RunTimeline({ entries }: RunTimelineProps) {
  if (entries.length === 0) {
    return (
      <div style={{ color: "#94a3b8", fontSize: 13, padding: "16px 0" }}>
        No state history available yet.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Vertical connecting line */}
      <div
        style={{
          position: "absolute",
          left: 11,
          top: 12,
          bottom: 12,
          width: 2,
          background: "#e2e8f0",
          zIndex: 0,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {entries.map((entry, idx) => {
          const dotColor = OUTCOME_COLORS[entry.outcome];
          return (
            <div
              key={`${entry.state}-${idx}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                paddingBottom: 20,
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* Dot */}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: OUTCOME_BG[entry.outcome],
                  border: `2px solid ${dotColor}`,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: dotColor,
                  }}
                />
              </div>

              {/* Content */}
              <div style={{ flex: 1, paddingTop: 2 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {entry.state}
                  </span>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: dotColor,
                      background: OUTCOME_BG[entry.outcome],
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {entry.outcome}
                  </span>

                  {entry.durationMs !== undefined && (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {formatDuration(entry.durationMs)}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {new Date(entry.enteredAt).toLocaleTimeString()}
                  {entry.exitedAt &&
                    ` → ${new Date(entry.exitedAt).toLocaleTimeString()}`}
                </div>

                {entry.error && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: "6px 10px",
                      background: "#fee2e2",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "#b91c1c",
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
