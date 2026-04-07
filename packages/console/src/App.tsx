import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { ReviewQueue } from "./pages/ReviewQueue";
import { RunDetail } from "./pages/RunDetail";
import { Candidates } from "./pages/Candidates";
import { CandidateDetail } from "./pages/CandidateDetail";
import { PolicyConfig } from "./pages/PolicyConfig";

/**
 * Root application component.
 *
 * Route structure:
 *   /                          → Dashboard
 *   /review                    → Review Queue
 *   /runs/:runId               → Run Detail
 *   /candidates                → Candidates list
 *   /candidates/:candidateId   → Candidate detail (edit + launch)
 *   /policy                    → Policy Config
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="review" element={<ReviewQueue />} />
          <Route path="runs/:runId" element={<RunDetail />} />
          <Route path="candidates" element={<Candidates />} />
          <Route path="candidates/:candidateId" element={<CandidateDetail />} />
          <Route path="policy" element={<PolicyConfig />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
