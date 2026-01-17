const DEFAULT_CONFIG = {
  proxyString: "127.0.0.1:7890",
  timeoutMs: 5000,
  proxyCollectMs: 3000,
};

let currentConfig = { ...DEFAULT_CONFIG };
let isTesting = false;

const requestStartById = {};
const proxyRequestsByTab = {};
const navigationStartByTab = {};
const proxyCollectStopTimeByTab = {};
const domainsSeenByTab = {};

function getDirectPAC(pageUrl) {
  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch (e) {}
  if (!host) {
    return {
      mode: "pac_script",
      pacScript: {
        data: `function FindProxyForURL(url, host) {
          return "DIRECT";
        }`,
      },
    };
  }
  return {
    mode: "pac_script",
    pacScript: {
      data: `function FindProxyForURL(url, host) {
        if (host === "${host}") {
          return "PROXY ${currentConfig.proxyString}; DIRECT";
        }
        return "DIRECT";
      }`,
    },
  };
}

chrome.storage.sync.get("proxyConfig", (data) => {
  if (data.proxyConfig) {
    currentConfig = { ...DEFAULT_CONFIG, ...data.proxyConfig };
  }
  syncCacheDynamicRules();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.proxyConfig) {
    currentConfig = { ...DEFAULT_CONFIG, ...changes.proxyConfig.newValue };
    syncCacheDynamicRules();
  }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }
  navigationStartByTab[details.tabId] = details.timeStamp;
  proxyRequestsByTab[details.tabId] = [];
  domainsSeenByTab[details.tabId] = {};
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "stopTest") {
    if (isTesting) {
      isTesting = false; // 标记停止，testDomains 中的循环或等待应该检查此标志
      chrome.proxy.settings.set({
        value: { mode: "system" },
        scope: "regular",
      });
    }
    sendResponse && sendResponse({ ok: true });
    return;
  }

  if (!message || message.action !== "startTestForPage") {
    return;
  }
  const pageUrl = message.url;
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
    sendResponse && sendResponse({ ok: false, error: "invalid_url" });
    return;
  }
  if (!currentConfig.proxyString || !currentConfig.proxyString.trim()) {
    sendResponse && sendResponse({ ok: false, error: "no_proxy" });
    return;
  }
  if (isTesting) {
    sendResponse && sendResponse({ ok: false, error: "busy" });
    return;
  }

  isTesting = true;

  chrome.storage.local.set({
    results: { status: "running", page: pageUrl, tests: [] },
    progress: { phase: "loading", startedAt: Date.now() },
  });

  (async () => {
    try {
      const results = await testDomains(pageUrl);
      // 如果 results 返回 null，说明是手动停止，保持现有结果不覆盖为 Error
      if (results) {
        chrome.storage.local.set({
          results: { ...results, status: "done" },
          progress: { phase: "done", startedAt: Date.now() },
        });
      }
    } catch (e) {
      chrome.storage.local.set({
        results: { status: "error", page: pageUrl, tests: [] },
        progress: { phase: "done", startedAt: Date.now() },
      });
    } finally {
      isTesting = false;
      chrome.proxy.settings.set({
        value: { mode: "system" },
        scope: "regular",
      });
    }
  })();

  sendResponse && sendResponse({ ok: true });
  return true;
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) {
      return;
    }

    const navStart = navigationStartByTab[details.tabId];
    if (typeof navStart === "number" && details.timeStamp < navStart) {
      return;
    }

    if (details.method && details.method !== "GET") {
      return;
    }

    if (!details.url || !/^https?:\/\//i.test(details.url)) {
      return;
    }

    let domain = null;
    try {
      const urlObj = new URL(details.url);
      domain = urlObj.hostname;
    } catch (e) {}

    if (domain) {
      if (!domainsSeenByTab[details.tabId]) {
        domainsSeenByTab[details.tabId] = {};
      }
      if (domainsSeenByTab[details.tabId][domain]) {
        return;
      }
      domainsSeenByTab[details.tabId][domain] = true;
    }

    requestStartById[details.requestId] = {
      tabId: details.tabId,
      url: details.url,
      startTime: details.timeStamp,
    };
  },
  { urls: ["<all_urls>"] },
);

function syncCacheDynamicRules() {
  if (
    !chrome.declarativeNetRequest ||
    !chrome.declarativeNetRequest.updateDynamicRules
  ) {
    return;
  }

  const ruleId = 1;
  const removeIds = [ruleId];

  if (currentConfig.disableCache) {
    const rule = {
      id: ruleId,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          {
            header: "Cache-Control",
            operation: "set",
            value: "no-cache",
          },
          {
            header: "Pragma",
            operation: "set",
            value: "no-cache",
          },
        ],
      },
      condition: {
        urlFilter: "|http*",
        resourceTypes: [
          "main_frame",
          "sub_frame",
          "script",
          "image",
          "stylesheet",
          "xmlhttprequest",
          "media",
          "font",
          "other",
        ],
      },
    };

    chrome.declarativeNetRequest.updateDynamicRules(
      { addRules: [rule], removeRuleIds: removeIds },
      () => {},
    );
  } else {
    chrome.declarativeNetRequest.updateDynamicRules(
      { addRules: [], removeRuleIds: removeIds },
      () => {},
    );
  }
}

function handleRequestFinished(details) {
  const startInfo = requestStartById[details.requestId];
  if (!startInfo) {
    return;
  }

  delete requestStartById[details.requestId];

  const tabId = startInfo.tabId;
  const url = startInfo.url;
  const startTime = startInfo.startTime;

  const startNav = navigationStartByTab[tabId];
  if (typeof startNav === "number" && startTime < startNav) {
    return;
  }

  if (!proxyRequestsByTab[tabId]) {
    proxyRequestsByTab[tabId] = [];
  }

  let status;
  const hasStatusCode = typeof details.statusCode === "number";
  if (hasStatusCode) {
    status = details.statusCode;
  } else if (details.error) {
    status = details.error.replace("net::ERR_", "");
  } else {
    status = "error";
  }

  let sizeBytes = null;
  if (hasStatusCode && Array.isArray(details.responseHeaders)) {
    for (let i = 0; i < details.responseHeaders.length; i++) {
      const h = details.responseHeaders[i];
      if (!h || !h.name) continue;
      if (String(h.name).toLowerCase() === "content-length") {
        const v = parseInt(h.value, 10);
        if (Number.isFinite(v) && v > 0) {
          sizeBytes = v;
          break;
        }
      }
    }
  }

  proxyRequestsByTab[tabId].push({
    url,
    startTime,
    endTime: details.timeStamp,
    status,
    sizeBytes,
  });
}

chrome.webRequest.onCompleted.addListener(
  handleRequestFinished,
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

chrome.webRequest.onErrorOccurred.addListener(
  handleRequestFinished,
  { urls: ["<all_urls>"] },
);

async function runPhase(pageUrl) {
  const collectMs =
    typeof currentConfig.proxyCollectMs === "number" &&
    currentConfig.proxyCollectMs >= 0
      ? currentConfig.proxyCollectMs
      : DEFAULT_CONFIG.proxyCollectMs;

  const timeoutMs =
    typeof currentConfig.timeoutMs === "number" && currentConfig.timeoutMs > 0
      ? currentConfig.timeoutMs
      : DEFAULT_CONFIG.timeoutMs;

  const config = getDirectPAC(pageUrl);
  chrome.proxy.settings.set({ value: config, scope: "regular" });

  let phaseTabId = null;

  await new Promise((resolve) => {
    chrome.tabs.create({ url: pageUrl, active: false }, (tab) => {
      phaseTabId = tab && tab.id;
      resolve();
    });
  });

  if (typeof phaseTabId !== "number") {
    return null;
  }

  const waitForPageLoad = new Promise((resolve) => {
    let timer = null;
    let isFinished = false;

    const cleanup = () => {
      if (isFinished) return;
      isFinished = true;
      if (timer) clearTimeout(timer);
      chrome.webRequest.onCompleted.removeListener(onMainCompleted);
      chrome.webRequest.onErrorOccurred.removeListener(onMainError);
    };

    const onMainCompleted = (details) => {
      if (details.tabId === phaseTabId && details.type === "main_frame") {
        cleanup();
        resolve("completed");
      }
    };

    const onMainError = (details) => {
      if (details.tabId === phaseTabId && details.type === "main_frame") {
        cleanup();
        resolve("error");
      }
    };

    chrome.webRequest.onCompleted.addListener(onMainCompleted, {
      urls: ["<all_urls>"],
    });
    chrome.webRequest.onErrorOccurred.addListener(onMainError, {
      urls: ["<all_urls>"],
    });

    timer = setTimeout(() => {
      cleanup();
      resolve("timeout");
    }, timeoutMs);
  });

  if (typeof phaseTabId === "number") {
    // 轮询检查 isTesting 标志，或者直接等待 waitForPageLoad
    // 这里为了支持立即中断，我们可以将 waitForPageLoad 包装一下，或者简单点在之后检查
    const status = await Promise.race([
      waitForPageLoad,
      new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isTesting) {
            clearInterval(checkInterval);
            resolve("aborted");
          }
        }, 200);
      }),
    ]);

    if (status === "aborted") {
      if (typeof phaseTabId === "number") {
        try {
          chrome.tabs.remove(phaseTabId);
        } catch (e) {}
      }
      return null;
    }

    // 如果加载完成，继续等待收集时间；如果是超时或错误，直接结束（或也可以等待一小段时间以确保请求被捕获）
    if (status === "completed") {
      chrome.storage.local.set({
        progress: { phase: "collecting", startedAt: Date.now() },
      });
      const endWait = Date.now() + collectMs;
      while (Date.now() < endWait) {
        if (!isTesting) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    
    // 记录结束时间，用于过滤请求
    proxyCollectStopTimeByTab[phaseTabId] = Date.now();
  }

  const stopTime =
    (typeof phaseTabId === "number" && proxyCollectStopTimeByTab[phaseTabId]) ||
    undefined;
  const info =
    typeof phaseTabId === "number"
      ? buildDomainToInfoForTab(phaseTabId, stopTime)
      : null;
  if (typeof phaseTabId === "number") {
    const perfInfo = await getPerfDomainToInfo(phaseTabId);
    if (perfInfo && info) {
      for (const d in perfInfo) {
        const perf = perfInfo[d];
        const target = info[d];
        if (perf && target) {
          const v = perf.duration;
          if (typeof v === "number") {
            target.duration = Math.round(v);
          }

          if (
            (typeof target.size !== "number" || target.size <= 0) &&
            typeof perf.size === "number" &&
            perf.size > 0
          ) {
            target.size = perf.size;
          }

          if (
            typeof target.size === "number" &&
            target.size > 0 &&
            typeof target.duration === "number" &&
            target.duration > 0
          ) {
            const kb = target.size / 1024;
            const seconds = target.duration / 1000;
            if (seconds > 0) {
              target.speedKBps = Math.round((kb / seconds) * 10) / 10;
            }
          }
        }
      }
    }
  }

  if (typeof phaseTabId === "number") {
    try {
      chrome.tabs.remove(phaseTabId);
    } catch (e) {}
    delete proxyCollectStopTimeByTab[phaseTabId];
  }

  return info || {};
}

async function testDomains(pageUrl) {
  const mainDomain = new URL(pageUrl).hostname;

  if (!isTesting) return null;
  const directInfo = await runPhase(pageUrl);

  if (!isTesting) return null;

  const domainToInfo = directInfo || {};
  const testItems = [];

  for (let domain in domainToInfo) {
    if (domain === mainDomain) continue;
    const info = domainToInfo[domain];
    testItems.push({
      domain: domain,
      url: info.url,
      direct: {
        status: info.status,
        duration: info.duration,
        size: typeof info.size === "number" ? info.size : null,
        speedKBps:
          typeof info.speedKBps === "number" ? info.speedKBps : null,
      },
    });
  }

  return { page: pageUrl, tests: testItems };
}

function buildDomainToInfoForTab(tabId, stopTime) {
  const requests = proxyRequestsByTab[tabId];
  if (!requests || !requests.length) {
    return null;
  }

  const result = {};

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];

    if (typeof stopTime === "number" && req.endTime > stopTime) {
      continue;
    }

    try {
      const urlObj = new URL(req.url);
      const domain = urlObj.hostname;

      if (result[domain]) {
        continue;
      }

      result[domain] = {
        url: req.url,
        status: req.status,
      };
      if (typeof req.sizeBytes === "number" && req.sizeBytes > 0) {
        result[domain].size = req.sizeBytes;
      }
    } catch (error) {}
  }

  return result;
}


function getPerfDomainToInfo(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(
        tabId,
        { action: "collectDomainInfo" },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          const info = resp && resp.domainToInfo;
          resolve(info || null);
        },
      );
    } catch (e) {
      resolve(null);
    }
  });
}
