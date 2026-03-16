/**
 * Dejsol Capture — Background Service Worker
 *
 * Manages session lifecycle, navigation tracking, screenshot capture,
 * and data aggregation. Communicates with content.js and popup.js.
 */

let session = null;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
let inactivityTimer = null;

// ------------------------------------------------------------------
// Session Management
// ------------------------------------------------------------------

function generateId() {
  return crypto.randomUUID();
}

function createSession(tabId) {
  return {
    session_id: generateId(),
    tab_id: tabId,
    company: "",
    job_title: "",
    ats_type: "unknown",
    url: "",
    started_at: new Date().toISOString(),
    completed_at: null,
    submitted: false,
    steps: [],
    current_step: null,
    value_log: [],
    conditional_fields: [],
    options_log: [],
    html_snapshots: {},
    screenshots: {},
  };
}

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (session) stopSession();
  }, INACTIVITY_TIMEOUT_MS);
}

async function startSession(tabId) {
  session = createSession(tabId);
  resetInactivityTimer();

  try {
    await chrome.tabs.sendMessage(tabId, { type: "start_recording" });
  } catch {
    // Content script may not be loaded yet
  }

  await persistSession();
  updateBadge("REC");
}

async function stopSession() {
  if (!session) return null;

  session.completed_at = new Date().toISOString();
  if (inactivityTimer) clearTimeout(inactivityTimer);

  try {
    await chrome.tabs.sendMessage(session.tab_id, { type: "stop_recording" });
  } catch {}

  await persistSession();
  updateBadge("");

  const finished = session;
  session = null;
  return finished;
}

async function persistSession() {
  if (!session) return;
  await chrome.storage.local.set({ dejsol_session: JSON.stringify(session) });
}

async function loadPersistedSession() {
  const data = await chrome.storage.local.get("dejsol_session");
  if (data.dejsol_session) {
    try {
      session = JSON.parse(data.dejsol_session);
    } catch {}
  }
}

function updateBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: text ? "#ef4444" : "#6b7280" });
}

// ------------------------------------------------------------------
// Screenshot Capture
// ------------------------------------------------------------------

async function captureScreenshot(reason) {
  if (!session) return null;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "png",
    });
    const stepNum = session.steps.length || 1;
    const key = `step_${stepNum}_${reason}.png`;
    session.screenshots[key] = dataUrl;
    return key;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Navigation Tracking
// ------------------------------------------------------------------

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!session) return;
  if (details.tabId !== session.tab_id) return;
  if (details.frameId !== 0) return;

  resetInactivityTimer();

  await captureScreenshot("navigation");

  try {
    await chrome.tabs.sendMessage(session.tab_id, {
      type: "request_capture",
      reason: "navigation",
    });
  } catch {}
});

// ------------------------------------------------------------------
// Message Handling from Content Script
// ------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!session && msg.type !== "start_session" && msg.type !== "get_session" && msg.type !== "stop_session" && msg.type !== "export_session") {
    sendResponse({ ok: false, reason: "no_session" });
    return true;
  }

  resetInactivityTimer();

  switch (msg.type) {
    case "start_session":
      handleStartSession(msg, sender).then(sendResponse);
      return true;

    case "stop_session":
      handleStopSession().then(sendResponse);
      return true;

    case "get_session":
      sendResponse(getSessionSummary());
      return true;

    case "export_session":
      handleExport().then(sendResponse);
      return true;

    case "page_captured":
      handlePageCapture(msg.data);
      sendResponse({ ok: true });
      return true;

    case "value_captured":
      session.value_log.push(msg.data);
      updateStepFieldValue(msg.data);
      persistSession();
      sendResponse({ ok: true });
      return true;

    case "conditional_field":
      session.conditional_fields.push(msg.data);
      persistSession();
      sendResponse({ ok: true });
      return true;

    case "options_detected":
      session.options_log.push(msg.data);
      persistSession();
      sendResponse({ ok: true });
      return true;

    case "fields_updated":
      if (session.steps.length > 0) {
        const lastStep = session.steps[session.steps.length - 1];
        lastStep.fields = msg.data.fields;
        persistSession();
      }
      sendResponse({ ok: true });
      return true;

    case "form_submitted":
      session.submitted = true;
      captureScreenshot("submit").then(() => persistSession());
      sendResponse({ ok: true });
      return true;

    case "submit_clicked":
      session.submitted = true;
      captureScreenshot("pre_submit").then(() => persistSession());
      sendResponse({ ok: true });
      return true;

    default:
      sendResponse({ ok: false, reason: "unknown_type" });
      return true;
  }
});

// ------------------------------------------------------------------
// Handlers
// ------------------------------------------------------------------

async function handleStartSession(msg, sender) {
  const tabId = msg.tabId || sender.tab?.id;
  if (!tabId) return { ok: false, reason: "no_tab" };

  await startSession(tabId);
  return { ok: true, session_id: session.session_id };
}

async function handleStopSession() {
  const finished = await stopSession();
  return { ok: true, session: finished ? getSessionSummary() : null };
}

function getSessionSummary() {
  if (!session) return { active: false };
  return {
    active: true,
    session_id: session.session_id,
    company: session.company,
    job_title: session.job_title,
    ats_type: session.ats_type,
    url: session.url,
    started_at: session.started_at,
    step_count: session.steps.length,
    field_count: session.steps.reduce((sum, s) => sum + (s.fields?.length || 0), 0),
    value_count: session.value_log.length,
    conditional_count: session.conditional_fields.length,
    submitted: session.submitted,
    duration_seconds: Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000),
  };
}

function handlePageCapture(data) {
  if (data.company && !session.company) session.company = data.company;
  if (data.job_title && !session.job_title) session.job_title = data.job_title;
  if (data.ats_type && data.ats_type !== "unknown") session.ats_type = data.ats_type;
  if (data.url) session.url = data.url;

  const stepNum = session.steps.length + 1;
  const htmlKey = `step_${stepNum}.html`;

  session.html_snapshots[htmlKey] = data.html;

  const conditionals = session.conditional_fields.filter(
    (cf) => !session.steps.some((s) =>
      s.conditional_fields?.some((scf) => scf.field_label === cf.field_label)
    )
  );

  session.steps.push({
    step: stepNum,
    url: data.url,
    html_file: htmlKey,
    screenshot: `step_${stepNum}_navigation.png`,
    fields: data.fields,
    conditional_fields: conditionals,
    timestamp: data.timestamp,
  });

  persistSession();
}

function updateStepFieldValue(valueData) {
  if (session.steps.length === 0) return;
  const lastStep = session.steps[session.steps.length - 1];
  if (!lastStep.fields) return;

  for (const field of lastStep.fields) {
    if (
      (field.for_id && field.for_id === valueData.for_id) ||
      field.label === valueData.label
    ) {
      field.value_entered = valueData.value;
      break;
    }
  }
}

// ------------------------------------------------------------------
// Export
// ------------------------------------------------------------------

async function handleExport() {
  const exportSession = session || await getLastSession();
  if (!exportSession) return { ok: false, reason: "no_session" };

  const sessionJson = buildExportJson(exportSession);

  await chrome.storage.local.set({
    dejsol_export: JSON.stringify({
      session: sessionJson,
      html_snapshots: exportSession.html_snapshots,
      screenshots: exportSession.screenshots,
    }),
  });

  return { ok: true, session: sessionJson };
}

async function getLastSession() {
  const data = await chrome.storage.local.get("dejsol_session");
  if (data.dejsol_session) {
    try { return JSON.parse(data.dejsol_session); } catch {}
  }
  return null;
}

function buildExportJson(s) {
  return {
    session_id: s.session_id,
    company: s.company,
    job_title: s.job_title,
    ats_type: s.ats_type,
    url: s.url,
    started_at: s.started_at,
    completed_at: s.completed_at || new Date().toISOString(),
    submitted: s.submitted,
    steps: s.steps.map((step) => ({
      step: step.step,
      url: step.url,
      html_file: step.html_file,
      screenshot: step.screenshot,
      fields: step.fields,
      conditional_fields: step.conditional_fields,
    })),
  };
}

// Restore session on service worker restart
loadPersistedSession().then(() => {
  if (session) updateBadge("REC");
});
