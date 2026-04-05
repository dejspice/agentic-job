import type { RunStatus } from "../types";

interface StatusBadgeProps {
  status: RunStatus;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; bg: string; color: string }
> = {
  SUBMITTED:             { label: "Submitted",            bg: "#dcfce7", color: "#15803d" },
  VERIFICATION_REQUIRED: { label: "Verify Email",         bg: "#fef3c7", color: "#b45309" },
  FAILED:                { label: "Failed",               bg: "#fee2e2", color: "#b91c1c" },
  ESCALATED:             { label: "Escalated",            bg: "#f3e8ff", color: "#7e22ce" },
  CANCELLED:             { label: "Cancelled",            bg: "#f1f5f9", color: "#475569" },
  IN_PROGRESS:           { label: "In Progress",          bg: "#dbeafe", color: "#1d4ed8" },
  REVIEW:                { label: "Review",               bg: "#fef9c3", color: "#a16207" },
  QUEUED:                { label: "Queued",               bg: "#f1f5f9", color: "#64748b" },
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    bg: "#f1f5f9",
    color: "#475569",
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: size === "sm" ? "2px 8px" : "3px 10px",
        borderRadius: 9999,
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 600,
        letterSpacing: "0.02em",
        backgroundColor: cfg.bg,
        color: cfg.color,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}
