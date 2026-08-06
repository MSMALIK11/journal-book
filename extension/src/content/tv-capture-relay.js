// ISOLATED world — forwards MAIN-world capture events to the extension background.
;(function initCaptureRelay() {
  if (window.__JB_CAPTURE_RELAY__) return
  window.__JB_CAPTURE_RELAY__ = true

  function forwardCapture(detail) {
    if (!detail?.changes?.length) return

    try {
      chrome.runtime.sendMessage({
        type: "TRADE_CAPTURED",
        changes: detail.changes,
        at: detail.at,
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
