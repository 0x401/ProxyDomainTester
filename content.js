chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "collectDomainInfo") {
    let domainToInfo = {};
    performance.getEntriesByType("resource").forEach((entry) => {
      try {
        let url = new URL(entry.name);
        if (!domainToInfo[url.hostname]) {
          let size = 0;
          if (typeof entry.transferSize === "number" && entry.transferSize > 0) {
            size = entry.transferSize;
          } else if (
            typeof entry.encodedBodySize === "number" &&
            entry.encodedBodySize > 0
          ) {
            size = entry.encodedBodySize;
          } else if (
            typeof entry.decodedBodySize === "number" &&
            entry.decodedBodySize > 0
          ) {
            size = entry.decodedBodySize;
          }
          domainToInfo[url.hostname] = {
            url: entry.name,
            duration: Math.round(entry.duration || 0),
            size: size,
          };
        }
      } catch (error) {}
    });
    sendResponse({ domainToInfo });
  }
  return true;
});
