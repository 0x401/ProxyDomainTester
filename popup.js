const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_COLLECT_MS = 3000;
let timeoutMsConfig = DEFAULT_TIMEOUT_MS;
let collectMsConfig = DEFAULT_COLLECT_MS;
let progressTimer = null;
let progressPhase = null;
let progressStartedAt = 0;

function localizeHtml() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.placeholder = msg;
  });
  document.title = chrome.i18n.getMessage("popupTitle");
}

function renderResults(results) {
  const resultsDiv = document.getElementById("results");
  while (resultsDiv.firstChild) {
    resultsDiv.removeChild(resultsDiv.firstChild);
  }

  if (!results) {
    const msg = document.createElement("div");
    msg.className = "empty-state";
    msg.textContent = chrome.i18n.getMessage("emptyStateNoResults");
    resultsDiv.appendChild(msg);
    return;
  }

  if (results.status === "running") {
    if (!results.tests || results.tests.length === 0) {
      const statusLine = document.createElement("div");
      statusLine.className = "meta-line";
      statusLine.textContent = chrome.i18n.getMessage("statusLabel", [chrome.i18n.getMessage("statusTesting")]);
      
      const pageLine = document.createElement("div");
      pageLine.className = "meta-line";
      pageLine.textContent = chrome.i18n.getMessage("pageLabel", [results.page]);
      
      const hintLine = document.createElement("div");
      hintLine.className = "meta-line";
      hintLine.style.color = "#888";
      hintLine.textContent = chrome.i18n.getMessage("noResultsYet");
      
      resultsDiv.appendChild(statusLine);
      resultsDiv.appendChild(pageLine);
      resultsDiv.appendChild(hintLine);
      return;
    }
  }

  if (results.status === "error") {
    const statusLine = document.createElement("div");
    statusLine.className = "meta-line";
    statusLine.innerHTML = `Status: <span class="status-error">${chrome.i18n.getMessage("statusError")}</span>`;
    
    const pageLine = document.createElement("div");
    pageLine.className = "meta-line";
    pageLine.textContent = chrome.i18n.getMessage("pageLabel", [results.page]);
    
    resultsDiv.appendChild(statusLine);
    resultsDiv.appendChild(pageLine);
    return;
  }

  if (results.tests && results.tests.length > 0) {
    const statusText =
      results.status === "running" ? chrome.i18n.getMessage("statusTesting") : chrome.i18n.getMessage("statusCompleted");
    const statusLine = document.createElement("div");
    statusLine.className = "meta-line";
    statusLine.textContent = chrome.i18n.getMessage("statusLabel", [statusText]);
    
    const pageLine = document.createElement("div");
    pageLine.className = "meta-line";
    pageLine.textContent = chrome.i18n.getMessage("pageLabel", [results.page]);
    
    resultsDiv.appendChild(statusLine);
    resultsDiv.appendChild(pageLine);

    const header = document.createElement("div");
    header.className = "results-header";

    const headers = [
      { text: chrome.i18n.getMessage("colDomain"), className: "domain-cell" },
      { text: chrome.i18n.getMessage("colStatus"), className: "status-cell" },
      { text: chrome.i18n.getMessage("colTime"), className: "duration-cell" },
      { text: chrome.i18n.getMessage("colSize"), className: "size-cell" },
      { text: chrome.i18n.getMessage("colSpeed"), className: "speed-cell" },
    ];

    headers.forEach((h) => {
      const cell = document.createElement("div");
      cell.className = "header-cell " + h.className;
      cell.textContent = h.text;
      header.appendChild(cell);
    });

    resultsDiv.appendChild(header);
    const getStatusSpan = (status) => {
      const span = document.createElement("span");
      if (status === "pending") {
        span.className = "status-pending";
        span.textContent = chrome.i18n.getMessage("statusWait");
      } else if (status === 200 || status === "200") {
        span.className = "status-200";
        span.textContent = "200";
      } else if (status === "timeout") {
        span.className = "status-timeout";
        span.textContent = chrome.i18n.getMessage("statusTimeout");
      } else if (status === "error") {
        span.className = "status-error";
        span.textContent = chrome.i18n.getMessage("statusErrorShort");
      } else {
        span.textContent = String(status);
      }
      return span;
    };

    const sortedTests = results.tests.slice().sort((a, b) => {
      const aKey = String(a.domain || "").split("").reverse().join("");
      const bKey = String(b.domain || "").split("").reverse().join("");
      return aKey.localeCompare(bKey);
    });

    sortedTests.forEach((test) => {
      const row = document.createElement("div");
      row.className = "result-row";

      const domainCell = document.createElement("div");
      domainCell.className = "cell domain-cell";
      
      // Changed: Display domain as a link
      if (test.url) {
        const link = document.createElement("a");
        link.href = test.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = test.domain;
        link.title = test.url; // Show full URL on hover
        domainCell.appendChild(link);
      } else {
        domainCell.textContent = test.domain;
      }
      
      row.appendChild(domainCell);

      const statusCell = document.createElement("div");
      statusCell.className = "cell status-cell";
      const directStatus =
        test.direct && typeof test.direct.status !== "undefined"
          ? test.direct.status
          : test.status;
      const directSpan = getStatusSpan(directStatus);
      statusCell.appendChild(directSpan);
      row.appendChild(statusCell);

      const directData =
        test.direct && typeof test.direct === "object" ? test.direct : test;

      const durationCell = document.createElement("div");
      durationCell.className = "cell duration-cell";
      const directDur = directData.duration;
      durationCell.textContent =
        typeof directDur === "number" ? String(directDur) : String(directDur || "-");
      row.appendChild(durationCell);

      const sizeCell = document.createElement("div");
      sizeCell.className = "cell size-cell";
      const sizeBytes = directData.size;
      if (typeof sizeBytes === "number" && sizeBytes > 0) {
        const kb = sizeBytes / 1024;
        sizeCell.textContent = String(Math.round(kb * 10) / 10);
      } else {
        sizeCell.textContent = "-";
      }
      row.appendChild(sizeCell);

      const speedCell = document.createElement("div");
      speedCell.className = "cell speed-cell";
      let speed = directData.speedKBps;
      if (
        (speed === null || typeof speed === "undefined") &&
        typeof sizeBytes === "number" &&
        sizeBytes > 0 &&
        typeof directDur === "number" &&
        directDur > 0
      ) {
        const kb = sizeBytes / 1024;
        const seconds = directDur / 1000;
        if (seconds > 0) {
          speed = Math.round((kb / seconds) * 10) / 10;
        }
      }
      speedCell.textContent =
        typeof speed === "number" ? String(speed) : "-";
      row.appendChild(speedCell);

      resultsDiv.appendChild(row);
    });
  } else {
    const msg = document.createElement("div");
    msg.className = "empty-state";
    msg.textContent = chrome.i18n.getMessage("emptyStateCompleted");
    resultsDiv.appendChild(msg);
  }
}

const startTestBtn = document.getElementById("startTestBtn");
const progressText = document.getElementById("progressText");

function clearProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function updateProgressDisplay(phase, startedAt) {
  if (!progressText) return;
  if (!phase || phase === "done") {
    clearProgressTimer();
    progressText.textContent = chrome.i18n.getMessage("testComplete");
    return;
  }
  progressPhase = phase;
  progressStartedAt = startedAt || Date.now();
  clearProgressTimer();
  progressTimer = setInterval(() => {
    if (!progressPhase || !progressText) return;
    const now = Date.now();
    let total = 0;
    let label = "";
    if (progressPhase === "loading") {
      total = timeoutMsConfig;
      label = chrome.i18n.getMessage("loadingPage");
    } else if (progressPhase === "collecting") {
      total = collectMsConfig;
      label = chrome.i18n.getMessage("testing");
    } else {
      progressText.textContent = chrome.i18n.getMessage("testComplete");
      clearProgressTimer();
      return;
    }
    const elapsed = now - progressStartedAt;
    const remaining = Math.max(0, total - elapsed);
    const seconds = Math.ceil(remaining / 1000);
    progressText.textContent = `${label}(${seconds})`;
    if (remaining <= 0) {
      if (progressPhase === "loading") {
        progressText.textContent = `${chrome.i18n.getMessage("loadingPage")}(0)`;
      } else if (progressPhase === "collecting") {
        progressText.textContent = `${chrome.i18n.getMessage("testing")}(0)`;
      }
    }
  }, 200);
}

if (startTestBtn) {
  startTestBtn.addEventListener("click", () => {
    chrome.storage.local.get("results", (data) => {
      const results = data.results;
      const isRunning = results && results.status === "running";

      if (isRunning) {
        // Stop logic
        chrome.runtime.sendMessage({ action: "stopTest" }, () => {
          chrome.storage.local.set({
            results: { ...results, status: "stopped" }
          });
        });
      } else {
        // Start logic
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (!tab || !tab.url || !/^https?:\/\//i.test(tab.url)) {
            chrome.storage.local.set({
              results: { status: "error", page: tab ? tab.url : "", tests: [] },
            });
            return;
          }
          if (progressText) {
            updateProgressDisplay("loading", Date.now());
          }
          chrome.runtime.sendMessage(
            { action: "startTestForPage", tabId: tab.id, url: tab.url },
            () => {},
          );
        });
      }
    });
  });
}

// Update button text based on status
function updateButtonState(status) {
  if (startTestBtn) {
    if (status === "running") {
      startTestBtn.textContent = chrome.i18n.getMessage("stopTestBtn");
      startTestBtn.classList.add("running");
    } else {
      startTestBtn.textContent = chrome.i18n.getMessage("startTestBtn");
      startTestBtn.classList.remove("running");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  localizeHtml();
  checkProxyConfig();
});

function checkProxyConfig() {
  chrome.storage.sync.get("proxyConfig", (data) => {
    const config = data.proxyConfig || {};
    if (!config.proxyString || !config.proxyString.trim()) {
      if (startTestBtn) {
        startTestBtn.disabled = true;
        startTestBtn.title = chrome.i18n.getMessage("configureProxyHint");
        startTestBtn.style.opacity = "0.5";
        startTestBtn.style.cursor = "not-allowed";
        
        // Also show a hint in the empty state or results area if needed
        const resultsDiv = document.getElementById("results");
        if (resultsDiv && (!resultsDiv.children.length || resultsDiv.querySelector(".empty-state"))) {
           resultsDiv.innerHTML = "";
           const msg = document.createElement("div");
           msg.className = "empty-state";
           msg.textContent = chrome.i18n.getMessage("configureProxyHint");
           resultsDiv.appendChild(msg);
        }
      }
    } else {
       if (startTestBtn) {
        startTestBtn.disabled = false;
        startTestBtn.title = "";
        startTestBtn.style.opacity = "1";
        startTestBtn.style.cursor = "pointer";
       }
    }
  });
}

chrome.storage.local.get("results", (data) => {
  if (data.results) {
    renderResults(data.results);
    updateButtonState(data.results.status);
  }
});

chrome.storage.local.get("progress", (data) => {
  const p = data.progress;
  if (p && p.phase) {
    updateProgressDisplay(p.phase, p.startedAt);
  } else if (progressText) {
    progressText.textContent = "";
  }
});

chrome.storage.sync.get("proxyConfig", (data) => {
  const config = data.proxyConfig || {};
  if (typeof config.timeoutMs === "number" && config.timeoutMs > 0) {
    timeoutMsConfig = config.timeoutMs;
  }
  if (
    typeof config.proxyCollectMs === "number" &&
    config.proxyCollectMs >= 0
  ) {
    collectMsConfig = config.proxyCollectMs;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.results) {
    renderResults(changes.results.newValue);
    updateButtonState(changes.results.newValue.status);
    const status = changes.results.newValue.status;
    if (status && status !== "running") {
      if (progressText) {
        progressText.textContent = chrome.i18n.getMessage("testComplete");
      }
      clearProgressTimer();
    }
  }
  if (area === "local" && changes.progress) {
    const p = changes.progress.newValue;
    if (p && p.phase) {
      updateProgressDisplay(p.phase, p.startedAt);
    } else if (progressText) {
      progressText.textContent = "";
      clearProgressTimer();
    }
  }
});
