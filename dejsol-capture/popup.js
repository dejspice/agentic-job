/**
 * Dejsol Capture — Popup UI Logic
 *
 * Controls session start/stop, displays live stats, and triggers export.
 */

const $ = (id) => document.getElementById(id);

let pollInterval = null;

// ------------------------------------------------------------------
// UI Update
// ------------------------------------------------------------------

function updateUI(summary) {
  const active = summary?.active === true;

  $("statusDot").classList.toggle("active", active);
  $("btnStart").disabled = active;
  $("btnStop").disabled = !active;
  $("btnExport").disabled = false;

  if (active) {
    $("fieldCount").textContent = summary.field_count || 0;
    $("valueCount").textContent = summary.value_count || 0;
    $("stepCount").textContent = summary.step_count || 0;
    $("conditionalCount").textContent = summary.conditional_count || 0;
    $("atsType").textContent = summary.ats_type || "—";
    $("submitted").textContent = summary.submitted ? "Yes" : "No";
    $("statusText").textContent = "Recording...";

    if (summary.company && !$("companyInput").value) {
      $("companyInput").value = summary.company;
    }

    const secs = summary.duration_seconds || 0;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    $("duration").textContent = `${m}:${String(s).padStart(2, "0")}`;
  } else {
    $("statusText").textContent = "Not recording";
  }
}

async function pollStatus() {
  try {
    const summary = await chrome.runtime.sendMessage({ type: "get_session" });
    updateUI(summary);
  } catch {}
}

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------

$("btnStart").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  await chrome.runtime.sendMessage({ type: "start_session", tabId: tab.id });
  $("statusText").textContent = "Starting...";

  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(pollStatus, 1000);
  setTimeout(pollStatus, 300);
});

$("btnStop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop_session" });
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  $("statusDot").classList.remove("active");
  $("btnStart").disabled = false;
  $("btnStop").disabled = true;
  $("statusText").textContent = "Session stopped — ready to export";
});

$("btnExport").addEventListener("click", async () => {
  $("statusText").textContent = "Preparing export...";
  $("btnExport").disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({ type: "export_session" });
    if (!result.ok) {
      $("statusText").textContent = "Nothing to export";
      $("btnExport").disabled = false;
      return;
    }

    const exportData = await chrome.storage.local.get("dejsol_export");
    if (!exportData.dejsol_export) {
      $("statusText").textContent = "Export data not found";
      $("btnExport").disabled = false;
      return;
    }

    const data = JSON.parse(exportData.dejsol_export);
    await buildAndDownloadZip(data);

    $("statusText").textContent = "Export downloaded!";
  } catch (err) {
    $("statusText").textContent = `Export failed: ${err.message}`;
  }
  $("btnExport").disabled = false;
});

// ------------------------------------------------------------------
// ZIP Export
// ------------------------------------------------------------------

async function buildAndDownloadZip(data) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();

  const company = data.session.company || "unknown";
  const ats = data.session.ats_type || "unknown";
  const date = new Date().toISOString().slice(0, 10);
  const folderName = `${company}_${ats}_${date}`;
  const folder = zip.folder(folderName);

  folder.file("session.json", JSON.stringify(data.session, null, 2));

  if (data.html_snapshots) {
    const htmlFolder = folder.folder("html");
    for (const [name, html] of Object.entries(data.html_snapshots)) {
      htmlFolder.file(name, html);
    }
  }

  if (data.screenshots) {
    const imgFolder = folder.folder("screenshots");
    for (const [name, dataUrl] of Object.entries(data.screenshots)) {
      if (dataUrl && dataUrl.startsWith("data:image/png;base64,")) {
        const base64 = dataUrl.split(",")[1];
        imgFolder.file(name, base64, { base64: true });
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename: `dejsol-capture/${folderName}.zip`,
    saveAs: false,
  });
}

function loadJSZip() {
  return new Promise((resolve, reject) => {
    if (window.JSZip) { resolve(window.JSZip); return; }
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("jszip.min.js");
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error("Failed to load JSZip"));
    document.head.appendChild(script);
  });
}

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------

pollStatus();
pollInterval = setInterval(pollStatus, 1000);
