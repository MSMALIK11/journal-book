// ISOLATED world — forwards MAIN-world capture events to the extension background.
;(function initCaptureRelay() {
  if (window.__JB_CAPTURE_RELAY__) return
  window.__JB_CAPTURE_RELAY__ = true

  function forwardCapture(detail) {
    const changes = detail?.changes || []
    const trades = detail?.trades || changes.map((c) => c?.trade).filter(Boolean)
    if (!changes.length && !trades.length) return

    try {
      chrome.runtime.sendMessage({
        type: "TRADE_CAPTURED",
        changes,
        trades,
        chartSymbol: detail?.chartSymbol || "",
        at: detail?.at || Date.now(),
      })
    } catch {
      // background sleeping — poll backup will retry
    }
  }

  window.addEventListener("jb-trade-captured", (event) => {
    forwardCapture(event?.detail)
  })

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data
    if (data?.source !== "jb-main-hook" || data?.type !== "jb-trade-captured") return
    forwardCapture(data.detail)
  })
})()
