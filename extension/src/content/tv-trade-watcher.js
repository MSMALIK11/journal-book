// Watches Strategy Tester "List of trades" DOM — instant open/exit sync, no TV refresh.
;(function initTvTradeWatcher() {
  if (window.__JB_TRADE_WATCHER__) return
  window.__JB_TRADE_WATCHER__ = true

  let lastFingerprint = ""
  let debounceTimer = null
  const DEBOUNCE_MS = 200
  // Fingerprint poll only — actual table scrape is light (top rows), not full scan.
  const POLL_MS = 2_000

  function tableFingerprint() {
    const root =
      document.querySelector("#bottom-area") ||
      document.querySelector('[class*="backtesting"]') ||
      document.querySelector('[data-name="backtesting"]') ||
      document.body
    if (!root) return ""

    const rows = root.querySelectorAll(
      "tbody tr.ka-row[data-row-id], tbody tr[data-row-id], tbody tr.ka-row",
    )
    if (!rows.length) return `rows:0`

    const parts = []
    const sample = [...rows].slice(0, 12)
    for (const row of sample) {
      const id = row.getAttribute("data-row-id") || ""
      const text = (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160)
      parts.push(`${id}|${text}`)
    }
    return `${rows.length}::${parts.join("||")}`
  }

  function requestSync(reason) {
    try {
      chrome.runtime.sendMessage({
        type: "TV_TABLE_CHANGED",
        reason,
        at: Date.now(),
      })
    } catch {
      // background may be asleep — next poll retries
    }
  }

  function scheduleSync(reason) {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const next = tableFingerprint()
      if (!next || next === lastFingerprint) return
      lastFingerprint = next
      requestSync(reason)
    }, DEBOUNCE_MS)
  }

  function startObserver() {
    const root =
      document.querySelector("#bottom-area") ||
      document.querySelector('[class*="backtesting"]') ||
      document.body
    if (!root || root.__jbObserverAttached) return
    root.__jbObserverAttached = true

    const observer = new MutationObserver(() => scheduleSync("dom"))
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  startObserver()
  setInterval(() => {
    startObserver()
    const next = tableFingerprint()
    if (next && next !== lastFingerprint) {
      lastFingerprint = next
      requestSync("poll")
    }
  }, POLL_MS)

  setTimeout(() => {
    lastFingerprint = tableFingerprint()
    if (lastFingerprint && lastFingerprint !== "rows:0") {
      requestSync("inject")
    }
  }, 800)

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleSync("visible")
  })
})()
