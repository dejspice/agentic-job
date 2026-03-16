import { TrendPill } from "./TrendPill";
import type { DashboardMetric } from "../types";

interface MetricCardProps {
  metric: DashboardMetric;
}

export function MetricCard({ metric }: MetricCardProps) {
  const hasDelta = metric.delta !== undefined && metric.delta !== 0;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "20px 24px",
        minWidth: 180,
        flex: "1 1 200px",
        // Left accent stripe when an accent color is provided
        borderLeft: metric.accent
          ? `4px solid ${metric.accent}`
          : "1px solid #e2e8f0",
        paddingLeft: metric.accent ? 20 : 24,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          color: "#64748b",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {metric.label}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: "#0f172a",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {metric.value}
        </span>
        {metric.unit && (
          <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>
            {metric.unit}
          </span>
        )}
        {hasDelta && (
          <TrendPill delta={metric.delta!} invertPolarity={metric.invertDelta} />
        )}
      </div>

      {metric.description && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: "#94a3b8",
            lineHeight: 1.4,
          }}
        >
          {metric.description}
        </p>
      )}
    </div>
  );
}
