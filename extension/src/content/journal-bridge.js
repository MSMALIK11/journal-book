// Bridges Live Sync page ↔ extension background (CustomEvent on shared DOM).
(function () {
  function ensureMarker() {
    let marker = document.getElementById("jb-extension-bridge")
    if (marker) return marker

    marker = document.createElement("div")
    marker.id = "jb-extension-bridge"
    marker.setAttribute("data-ready", "1")
    marker.style.display = "none"
    ;(document.body || document.documentElement).appendChild(marker)
    return marker
  }

  ensureMarker()
  setInterval(ensureMarker, 5000)

  document.addEventListener("jb-bridge-ping", () => {
    ensureMarker()
    document.dispatchEvent(new CustomEvent("jb-bridge-pong"))
  })

  document.addEventListener("jb-sync-request", (event) => {
    const requestId = event.detail?.requestId
    if (!requestId) return

    chrome.runtime.sendMessage({ type: "REFRESH_NEW_TRADES" }, (response) => {
      const runtimeError = chrome.runtime.lastError?.message
      document.dispatchEvent(
        new CustomEvent("jb-sync-response", {
          detail: {
            requestId,
            error:
              runtimeError ||
              (response?.ok === false ? response.error : undefined) ||
              undefined,
            result: response?.ok !== false ? response : undefined,
          },
        }),
      )
    })
  })
  async function wakeBackground() {
    try {
      await chrome.runtime.sendMessage({ type: "HEARTBEAT_TICK" })
      await chrome.runtime.sendMessage({ type: "CHECK_REFRESH_REQUEST" })
    } catch {
      // background may be restarting
    }
  }

  void wakeBackground()
  // Keep extension alive on journal pages — wakes MV3 service worker for UI refresh.
  setInterval(() => {
    void wakeBackground()
  }, 5000)
})()
