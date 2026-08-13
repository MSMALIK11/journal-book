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

  function emitTradesSynced(detail) {
    ensureMarker()
    document.dispatchEvent(
      new CustomEvent("jb-trades-synced", {
        detail: {
          type: "trades_updated",
          ...detail,
        },
      }),
    )
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

    const type = event.detail?.reloadChart ? "RELOAD_TV_AND_SYNC" : "REFRESH_NEW_TRADES"
    chrome.runtime.sendMessage({ type }, (response) => {
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

  // Instant push from background after open/exit sync (faster than executeScript alone).
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "TRADES_SYNCED") return
    emitTradesSynced(message.detail || message)
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
  // Keep the service worker warm without hammering refresh-status every few seconds.
  setInterval(() => {
    void wakeBackground()
  }, 10_000)
})()
