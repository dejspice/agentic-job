import { Topbar } from "../components/Topbar";
import { StateName } from "../types";
import type { PolicyEntry } from "../types";

// ---------------------------------------------------------------------------
// Placeholder data — one entry per workflow state
// ---------------------------------------------------------------------------

const MOCK_POLICIES: PolicyEntry[] = [
  {
    state: StateName.INIT,
    maxRetries: 3,
    timeoutSeconds: 30,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.OPEN_JOB_PAGE,
    maxRetries: 3,
    timeoutSeconds: 60,
    retryBackoff: "EXPONENTIAL",
    onFailure: "RETRY",
    onTimeout: "RETRY",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.DETECT_APPLY_ENTRY,
    maxRetries: 2,
    timeoutSeconds: 30,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.7,
    humanReviewTrigger: "confidence < 0.7",
  },
  {
    state: StateName.LOGIN_OR_CONTINUE,
    maxRetries: 2,
    timeoutSeconds: 60,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.UPLOAD_RESUME,
    maxRetries: 3,
    timeoutSeconds: 120,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.WAIT_FOR_PARSE,
    maxRetries: 5,
    timeoutSeconds: 180,
    retryBackoff: "EXPONENTIAL",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.VALIDATE_PARSED_PROFILE,
    maxRetries: 1,
    timeoutSeconds: 30,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0.8,
    humanReviewTrigger: "confidence < 0.8",
  },
  {
    state: StateName.FILL_REQUIRED_FIELDS,
    maxRetries: 2,
    timeoutSeconds: 300,
    retryBackoff: "EXPONENTIAL",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: true,
    confidenceThreshold: 0.75,
    humanReviewTrigger: "confidence < 0.75",
  },
  {
    state: StateName.ANSWER_SCREENING_QUESTIONS,
    maxRetries: 2,
    timeoutSeconds: 300,
    retryBackoff: "EXPONENTIAL",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: true,
    confidenceThreshold: 0.7,
    humanReviewTrigger: "confidence < 0.7",
  },
  {
    state: StateName.REVIEW_DISCLOSURES,
    maxRetries: 2,
    timeoutSeconds: 120,
    retryBackoff: "LINEAR",
    onFailure: "SKIP_STATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.PRE_SUBMIT_CHECK,
    maxRetries: 1,
    timeoutSeconds: 60,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: true,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.SUBMIT,
    maxRetries: 1,
    timeoutSeconds: 60,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: true,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.CAPTURE_CONFIRMATION,
    maxRetries: 3,
    timeoutSeconds: 60,
    retryBackoff: "EXPONENTIAL",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: true,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
  {
    state: StateName.ESCALATE,
    maxRetries: 0,
    timeoutSeconds: 0,
    retryBackoff: "LINEAR",
    onFailure: "ESCALATE",
    onTimeout: "ESCALATE",
    requiresScreenshot: false,
    requiresDomSnapshot: false,
    confidenceThreshold: 0,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TH: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 12,
  color: "#0f172a",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

function CheckIcon({ value }: { value: boolean }) {
  return (
    <span style={{ color: value ? "#16a34a" : "#94a3b8", fontWeight: 700 }}>
      {value ? "✓" : "—"}
    </span>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: color + "22",
        color,
      }}
    >
      {text}
    </span>
  );
}

function onFailureBadge(v: PolicyEntry["onFailure"]) {
  const map: Record<PolicyEntry["onFailure"], string> = {
    RETRY: "#16a34a",
    SKIP_STATE: "#d97706",
    ESCALATE: "#7e22ce",
  };
  return <Badge text={v} color={map[v]} />;
}

function onTimeoutBadge(v: PolicyEntry["onTimeout"]) {
  const map: Record<PolicyEntry["onTimeout"], string> = {
    RETRY: "#16a34a",
    ESCALATE: "#7e22ce",
  };
  return <Badge text={v} color={map[v]} />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PolicyConfig() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar
        title="Policy Config"
        subtitle="State-level retry, timeout, and escalation policies"
        actions={
          <button
            style={{
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 7,
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              color: "#64748b",
              cursor: "not-allowed",
              opacity: 0.6,
            }}
            disabled
            title="Policy editing not yet wired to the API"
          >
            Edit Policies
          </button>
        }
      />

      <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
        {/* Info callout */}
        <div
          style={{
            padding: "12px 16px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            fontSize: 13,
            color: "#1e40af",
            marginBottom: 24,
          }}
        >
          These policies are applied per-state during workflow execution. Policy
          editing will be wired to the API in a later phase.
        </div>

        {/* Policy table */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>State</th>
                  <th style={TH}>Retries</th>
                  <th style={TH}>Timeout</th>
                  <th style={TH}>Backoff</th>
                  <th style={TH}>On Failure</th>
                  <th style={TH}>On Timeout</th>
                  <th style={TH}>Screenshot</th>
                  <th style={TH}>DOM Snap</th>
                  <th style={TH}>Confidence</th>
                  <th style={TH}>Review Trigger</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_POLICIES.map((p) => (
                  <tr key={p.state}>
                    <td style={TD}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#1e293b",
                        }}
                      >
                        {p.state}
                      </span>
                    </td>
                    <td style={TD}>{p.maxRetries}</td>
                    <td style={{ ...TD, color: "#64748b" }}>
                      {p.timeoutSeconds > 0 ? `${p.timeoutSeconds}s` : "—"}
                    </td>
                    <td style={{ ...TD, fontSize: 11, color: "#64748b" }}>
                      {p.retryBackoff}
                    </td>
                    <td style={TD}>{onFailureBadge(p.onFailure)}</td>
                    <td style={TD}>{onTimeoutBadge(p.onTimeout)}</td>
                    <td style={TD}><CheckIcon value={p.requiresScreenshot} /></td>
                    <td style={TD}><CheckIcon value={p.requiresDomSnapshot} /></td>
                    <td style={TD}>
                      {p.confidenceThreshold > 0
                        ? `${(p.confidenceThreshold * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td style={{ ...TD, fontSize: 11, color: "#64748b" }}>
                      {p.humanReviewTrigger ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
