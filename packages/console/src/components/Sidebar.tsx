import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/",           label: "Dashboard",    icon: "◈", end: true },
  { to: "/runs",       label: "Run Queue",    icon: "▶" },
  { to: "/candidates", label: "Candidates",   icon: "◎" },
  { to: "/review",     label: "Review Queue", icon: "⊙" },
  { to: "/policy",     label: "Policy Config", icon: "⚙" },
];

export function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        minHeight: "100vh",
        background: "#1e293b",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      {/* Logo / wordmark */}
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid #334155",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            D
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>
              dejsol
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.08em" }}>
              OPERATOR CONSOLE
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "16px 12px" }}>
        <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", fontWeight: 600, padding: "0 8px 8px" }}>
          NAVIGATION
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: 8,
              marginBottom: 2,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#f8fafc" : "#94a3b8",
              background: isActive ? "#334155" : "transparent",
              textDecoration: "none",
              transition: "background 0.1s, color 0.1s",
            })}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid #334155",
          fontSize: 11,
          color: "#475569",
        }}
      >
        v0.1.0
      </div>
    </aside>
  );
}
