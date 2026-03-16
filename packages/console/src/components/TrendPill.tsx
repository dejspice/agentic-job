/**
 * Compact trend indicator shown next to KPI values.
 *
 * Renders a colored pill with a directional arrow and a percentage change.
 * By default, positive delta = green (good), negative = red (bad).
 * Set invertPolarity=true for metrics where lower is better
 * (e.g. HITL rate, failure rate, LLM cost).
 */

interface TrendPillProps {
  /** Percentage change value (e.g. 6.5 means +6.5%). */
  delta: number;
  /**
   * When true, a negative delta is rendered green and a positive delta red.
   * Use for cost, failure rate, HITL rate — where declining is improvement.
   */
  invertPolarity?: boolean;
  /** Override the display text.  Defaults to "|delta|%". */
  label?: string;
}

export function TrendPill({
  delta,
  invertPolarity = false,
  label,
}: TrendPillProps) {
  const isGood = invertPolarity ? delta <= 0 : delta >= 0;
  const isNeutral = delta === 0;

  const color  = isNeutral ? "#64748b" : isGood ? "#15803d" : "#b91c1c";
  const bg     = isNeutral ? "#f1f5f9" : isGood ? "#dcfce7"  : "#fee2e2";
  const arrow  = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const text   = label ?? `${Math.abs(delta).toFixed(1)}%`;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
        whiteSpace: "nowrap",
        letterSpacing: "0.01em",
      }}
    >
      {arrow} {text}
    </span>
  );
}
