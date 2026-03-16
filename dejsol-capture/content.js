/**
 * Dejsol Capture — Content Script
 *
 * Injected into ATS pages. Extracts form fields, captures values entered,
 * detects conditional fields via MutationObserver, and snapshots page HTML.
 * Communicates with background.js via chrome.runtime messages.
 */
(function () {
  "use strict";

  let isRecording = false;
  let knownFieldSignatures = new Set();
  let lastValueChangeField = null;
  let lastValueChangeValue = null;
  const debouncers = new Map();

  // ------------------------------------------------------------------
  // Field Extraction
  // ------------------------------------------------------------------

  function getLabelForElement(el) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent.trim();
    }

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const ref = document.getElementById(ariaLabelledBy);
      if (ref) return ref.textContent.trim();
    }

    let node = el.closest("label");
    if (node) return node.textContent.trim();

    node = el.closest("[class*='field'], [class*='form-group'], [class*='question']");
    if (node) {
      const label = node.querySelector("label, [class*='label'], legend");
      if (label) return label.textContent.trim();
    }

    if (el.placeholder) return el.placeholder.trim();
    if (el.name) return el.name;

    return "";
  }

  function getFieldType(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    const ariaAC = el.getAttribute("aria-autocomplete") || "";

    if (role === "combobox" || ariaAC) return "combobox";
    if (tag === "select") return "select";
    if (tag === "textarea") return "textarea";
    if (tag === "input") return `input:${el.type || "text"}`;
    return tag;
  }

  function getSelectOptions(el) {
    const tag = el.tagName.toLowerCase();

    if (tag === "select") {
      return Array.from(el.options)
        .map((o) => o.textContent.trim())
        .filter(Boolean);
    }

    return null;
  }

  function getReactSelectOptions() {
    const options = document.querySelectorAll(
      "[id*='-option-'], [class*='select__option'], [role='option']"
    );
    if (options.length === 0) return null;
    return Array.from(options)
      .map((o) => o.textContent.trim())
      .filter(Boolean);
  }

  function getCurrentValue(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") {
      return el.options[el.selectedIndex]?.textContent.trim() || "";
    }
    if (el.getAttribute("role") === "combobox") {
      const container = el.closest("[class*='select__control']")?.parentElement;
      if (container) {
        const sv = container.querySelector("[class*='singleValue'], [class*='select__single-value']");
        if (sv) return sv.textContent.trim();
      }
    }
    return el.value || "";
  }

  function scanFields() {
    const selectors = [
      "input:not([type='hidden']):not([type='submit']):not([type='button'])",
      "select",
      "textarea",
      "[role='combobox']",
    ].join(", ");

    const elements = document.querySelectorAll(selectors);
    const fields = [];

    for (const el of elements) {
      if (el.id && el.id.startsWith("react-select-") && el.id.endsWith("-input")) {
        continue;
      }
      if (!el.offsetParent && el.type !== "hidden") continue;

      const label = getLabelForElement(el);
      if (!label) continue;

      const fieldType = getFieldType(el);
      const options = getSelectOptions(el);
      const isRequired =
        el.required ||
        el.getAttribute("aria-required") === "true" ||
        label.includes("*");

      fields.push({
        label,
        for_id: el.id || "",
        name: el.name || "",
        type: fieldType,
        required: isRequired,
        placeholder: el.placeholder || "",
        value_entered: getCurrentValue(el),
        options,
      });
    }

    return fields;
  }

  function fieldSignature(f) {
    return `${f.label}||${f.for_id}||${f.type}`;
  }

  // ------------------------------------------------------------------
  // Value Capture
  // ------------------------------------------------------------------

  function debounce(key, fn, delay = 800) {
    if (debouncers.has(key)) clearTimeout(debouncers.get(key));
    debouncers.set(key, setTimeout(() => { debouncers.delete(key); fn(); }, delay));
  }

  function onValueChange(e) {
    if (!isRecording) return;
    const el = e.target;
    const label = getLabelForElement(el);
    if (!label) return;

    const fieldId = el.id || el.name || label;
    debounce(fieldId, () => {
      const value = getCurrentValue(el);
      lastValueChangeField = label;
      lastValueChangeValue = value;

      sendToBackground("value_captured", {
        label,
        for_id: el.id || "",
        value,
        timestamp: new Date().toISOString(),
      });
    });
  }

  function setupValueListeners() {
    document.addEventListener("input", onValueChange, true);
    document.addEventListener("change", onValueChange, true);

    const rsObserver = new MutationObserver((mutations) => {
      if (!isRecording) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          const sv = node.closest
            ? node.querySelector("[class*='singleValue'], [class*='select__single-value']")
            : null;
          if (sv) {
            const container = sv.closest("[class*='select__control']")?.parentElement;
            if (!container) continue;
            const label = getLabelForElement(container.querySelector("input") || container) ||
                          container.closest("[class*='field']")?.querySelector("label")?.textContent?.trim() || "";
            if (!label) continue;
            sendToBackground("value_captured", {
              label,
              for_id: "",
              value: sv.textContent.trim(),
              timestamp: new Date().toISOString(),
            });
          }

          // Capture React Select options when menu opens
          const opts = node.querySelectorAll
            ? node.querySelectorAll("[id*='-option-'], [class*='select__option'], [role='option']")
            : [];
          if (opts.length > 0) {
            const optTexts = Array.from(opts).map((o) => o.textContent.trim()).filter(Boolean);
            sendToBackground("options_detected", {
              options: optTexts,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    });

    rsObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ------------------------------------------------------------------
  // Conditional Field Detection
  // ------------------------------------------------------------------

  function setupConditionalDetection() {
    const formContainer =
      document.querySelector("form") ||
      document.querySelector("[class*='application']") ||
      document.body;

    const observer = new MutationObserver((mutations) => {
      if (!isRecording) return;

      let newFieldsFound = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          const inputs = node.querySelectorAll
            ? node.querySelectorAll("input, select, textarea, [role='combobox']")
            : [];
          if (node.matches && node.matches("input, select, textarea, [role='combobox']")) {
            checkNewField(node);
            newFieldsFound = true;
          }
          for (const inp of inputs) {
            checkNewField(inp);
            newFieldsFound = true;
          }
        }
      }

      if (newFieldsFound) {
        setTimeout(() => {
          const fields = scanFields();
          sendToBackground("fields_updated", { fields });
        }, 500);
      }
    });

    observer.observe(formContainer, { childList: true, subtree: true });
  }

  function checkNewField(el) {
    const label = getLabelForElement(el);
    if (!label) return;
    const sig = `${label}||${el.id || ""}||${getFieldType(el)}`;

    if (!knownFieldSignatures.has(sig)) {
      knownFieldSignatures.add(sig);
      sendToBackground("conditional_field", {
        field_label: label,
        for_id: el.id || "",
        type: getFieldType(el),
        triggered_by_field: lastValueChangeField || "",
        triggered_by_value: lastValueChangeValue || "",
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ------------------------------------------------------------------
  // HTML Snapshot
  // ------------------------------------------------------------------

  function captureHTML() {
    return document.documentElement.outerHTML;
  }

  // ------------------------------------------------------------------
  // Communication with Background
  // ------------------------------------------------------------------

  function sendToBackground(type, data) {
    chrome.runtime.sendMessage({ type, data }).catch(() => {});
  }

  function doFullCapture(reason) {
    if (!isRecording) return;

    const ats = window.__dejsolATS;
    const fields = scanFields();

    fields.forEach((f) => knownFieldSignatures.add(fieldSignature(f)));

    sendToBackground("page_captured", {
      reason,
      url: location.href,
      ats_type: ats ? ats.detectATS(location.href) : "unknown",
      company: ats ? ats.extractCompanyFromURL(location.href) : "",
      job_title: ats ? ats.extractJobTitleFromPage() : "",
      fields,
      html: captureHTML(),
      timestamp: new Date().toISOString(),
    });
  }

  // ------------------------------------------------------------------
  // Message Handling
  // ------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "start_recording") {
      isRecording = true;
      knownFieldSignatures.clear();
      setupValueListeners();
      setupConditionalDetection();
      doFullCapture("session_start");
      sendResponse({ ok: true });
    } else if (msg.type === "stop_recording") {
      isRecording = false;
      sendResponse({ ok: true });
    } else if (msg.type === "request_capture") {
      doFullCapture(msg.reason || "manual");
      sendResponse({ ok: true });
    } else if (msg.type === "get_status") {
      sendResponse({
        recording: isRecording,
        fieldCount: knownFieldSignatures.size,
        url: location.href,
      });
    }
    return true;
  });

  // Auto-capture on form submit
  document.addEventListener("submit", () => {
    if (isRecording) {
      sendToBackground("form_submitted", {
        url: location.href,
        timestamp: new Date().toISOString(),
      });
    }
  }, true);

  // Detect "Submit Application" button clicks
  document.addEventListener("click", (e) => {
    if (!isRecording) return;
    const el = e.target.closest("input[type='submit'], button[type='submit'], button");
    if (!el) return;
    const text = (el.textContent || el.value || "").toLowerCase();
    if (text.includes("submit") || text.includes("apply")) {
      doFullCapture("pre_submit_click");
      sendToBackground("submit_clicked", {
        button_text: el.textContent || el.value || "",
        url: location.href,
        timestamp: new Date().toISOString(),
      });
    }
  }, true);
})();
