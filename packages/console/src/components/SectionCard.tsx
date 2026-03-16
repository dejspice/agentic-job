/**
 * Reusable section container used across Dashboard and ReviewQueue pages.
 *
 * Renders a white card with a title bar and an optional header-right slot
 * for actions, links, or counts.  children fill the card body.
 */

interface SectionCardProps {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Remove default body padding (useful when embedding a flush table). */
  noPadding?: boolean;
}

export function SectionCard({
  title,
  headerRight,
  children,
  style,
  noPadding = false,
}: SectionCardProps) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 20px",
          borderBottom: "1px solid #f1f5f9",
          background: "#fafafa",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "0.01em",
          }}
        >
          {title}
        </h3>
        {headerRight && (
          <div style={{ display: "flex", alignItems: "center" }}>
            {headerRight}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={noPadding ? undefined : { padding: "16px 20px" }}>
        {children}
      </div>
    </div>
  );
}
