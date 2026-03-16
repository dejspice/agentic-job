/**
 * ATS platform detection from URL patterns.
 * Injected before content.js so window.__dejsolATS is available.
 */
(function () {
  const ATS_PATTERNS = [
    { pattern: /greenhouse\.io/i, type: "greenhouse" },
    { pattern: /jobs\.lever\.co/i, type: "lever" },
    { pattern: /myworkday(jobs)?\.com/i, type: "workday" },
    { pattern: /icims\.com/i, type: "icims" },
    { pattern: /ashbyhq\.com/i, type: "ashby" },
    { pattern: /smartrecruiters\.com/i, type: "smartrecruiters" },
    { pattern: /taleo\.net/i, type: "taleo" },
    { pattern: /successfactors\.com/i, type: "successfactors" },
    { pattern: /jobvite\.com/i, type: "jobvite" },
    { pattern: /breezy\.hr/i, type: "breezy" },
    { pattern: /applytojob\.com/i, type: "jazz" },
  ];

  function detectATS(url) {
    for (const { pattern, type } of ATS_PATTERNS) {
      if (pattern.test(url)) return type;
    }
    return "unknown";
  }

  function extractCompanyFromURL(url) {
    try {
      const u = new URL(url);
      const host = u.hostname;
      const path = u.pathname;

      if (host.includes("greenhouse.io")) {
        const match = path.match(/^\/([^/]+)/);
        return match ? match[1] : "";
      }
      if (host.includes("lever.co")) {
        const match = path.match(/^\/([^/]+)/);
        return match ? match[1] : "";
      }
      if (host.includes("myworkday")) {
        const match = host.match(/^([^.]+)\./);
        return match ? match[1] : "";
      }
      const sub = host.split(".")[0];
      if (!["www", "jobs", "careers", "apply"].includes(sub)) return sub;
      return host.split(".").slice(-2, -1)[0] || "";
    } catch {
      return "";
    }
  }

  function extractJobTitleFromPage() {
    const selectors = [
      "h1",
      "[class*='job-title']",
      "[class*='jobTitle']",
      "[data-test='job-title']",
      ".posting-headline h2",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 3) {
        return el.textContent.trim().slice(0, 200);
      }
    }
    return document.title.replace(/\s*[-|].*$/, "").trim().slice(0, 200);
  }

  window.__dejsolATS = {
    detectATS,
    extractCompanyFromURL,
    extractJobTitleFromPage,
  };
})();
