document.addEventListener("DOMContentLoaded", () => {
  const proxyInput = document.getElementById("proxyString");
  const timeoutInput = document.getElementById("timeoutMs");
  const disableCacheCheckbox = document.getElementById("disableCache");
  const proxyCollectInput = document.getElementById("proxyCollectMs");

  // Localize HTML
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
  document.title = chrome.i18n.getMessage("optionsTitle");

  // 加载现有配置
  chrome.storage.sync.get("proxyConfig", (data) => {
    const config = data.proxyConfig || {};
    proxyInput.value = config.proxyString || "";
    timeoutInput.value =
      typeof config.timeoutMs === "number" && config.timeoutMs > 0
        ? String(config.timeoutMs)
        : "";
    disableCacheCheckbox.checked = config.disableCache === true;
    proxyCollectInput.value =
      typeof config.proxyCollectMs === "number" && config.proxyCollectMs >= 0
        ? String(config.proxyCollectMs)
        : "";
  });


  function saveConfig() {
    const timeoutMs = parseInt(timeoutInput.value.trim(), 10);
    const proxyCollectMs = parseInt(proxyCollectInput.value.trim(), 10);
    const newConfig = {
      proxyString: proxyInput.value.trim(),
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0,
      disableCache: disableCacheCheckbox.checked,
      proxyCollectMs:
        Number.isFinite(proxyCollectMs) && proxyCollectMs >= 0
          ? proxyCollectMs
          : 0,
    };

    chrome.storage.sync.set({ proxyConfig: newConfig })
  }

  disableCacheCheckbox.addEventListener("change", saveConfig);
  proxyInput.addEventListener("input", saveConfig);
  timeoutInput.addEventListener("input", saveConfig);
  proxyCollectInput.addEventListener("input", saveConfig);
});
