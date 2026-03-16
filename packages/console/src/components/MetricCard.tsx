import type { DashboardMetric } from "../types";

interface MetricCardProps {
  metric: DashboardMetric;
}

export function MetricCard({ metric }: MetricCardProps) {
  const hasDelta = metric.delta !== undefined;
  const isPositive = (metric.delta ?? 0) >= 0;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "20px 24px",
        minWidth: 180,
        flex: "1 1 180px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 500,
          color: "#64748b",
          letterSpacing: "0.01em",
        }}
      >
        {metric.label}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 8,
        }}
      >
        <span
          style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}
        >
          {metric.value}
        </span>
        {metric.unit && (
          <span style={{ fontSize: 14, color: "#94a3b8" }}>{metric.unit}</span>
        )}
      </div>

      {hasDelta && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            fontWeight: 500,
            color: isPositive ? "#16a34a" : "#dc2626",
          }}
        >
          {isPositive ? "▲" : "▼"} {Math.abs(metric.delta!)}% vs last period
        </p>
      )}
    </div>
  );
}
