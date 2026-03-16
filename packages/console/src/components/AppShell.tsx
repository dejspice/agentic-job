import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

/**
 * Persistent layout wrapper.
 *
 * Renders the fixed sidebar and a scrollable main content area.
 * Nested routes are mounted via <Outlet />.
 */
export function AppShell() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <Sidebar />

      {/* Main content area — offset by sidebar width */}
      <div
        style={{
          flex: 1,
          marginLeft: 240,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          overflow: "hidden",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
