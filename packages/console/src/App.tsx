import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { ReviewQueue } from "./pages/ReviewQueue";
import { RunDetail } from "./pages/RunDetail";
import { PolicyConfig } from "./pages/PolicyConfig";

/**
 * Root application component.
 *
 * Route structure:
 *   /               → Dashboard
 *   /review         → Review Queue
 *   /runs/:runId    → Run Detail
 *   /policy         → Policy Config
 *
 * All routes are nested under AppShell, which renders the persistent
 * sidebar + layout wrapper.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="review" element={<ReviewQueue />} />
          <Route path="runs/:runId" element={<RunDetail />} />
          <Route path="policy" element={<PolicyConfig />} />
          {/* Catch-all: redirect unknown paths to the dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
