/* global chrome */
;(function initTvPoller() {
  if (window.__JB_TV_POLLER__) return
  window.__JB_TV_POLLER__ = true

  let timer = null
  let lastInterval = null

  async function readSettings() {
    const stored = await chrome.storage.sync.get([
      "syncToken",
      "pollIntervalSeconds",
      "autoSyncTrades",
    ])
    const pollIntervalSeconds =
      stored.pollIntervalSeconds === undefined ? 30 : Number(stored.pollIntervalSeconds)
    return {
      configured: Boolean((stored.syncToken || "").trim()),
      pollIntervalSeconds: Number.isFinite(pollIntervalSeconds) ? pollIntervalSeconds : 30,
      // Must match options/sync-client — Boolean(undefined) is false and silently
      // disables POLL_TICK trade sync for anyone who never toggled the checkbox.
      autoSyncTrades: stored.autoSyncTrades === undefined ? true : Boolean(stored.autoSyncTrades),
    }
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function keepaliveTick() {
    const settings = await readSettings()
    if (!settings.configured) return

    try {
      await chrome.runtime.sendMessage({ type: "HEARTBEAT_TICK" })
      await chrome.runtime.sendMessage({ type: "CHECK_REFRESH_REQUEST" })
    } catch {
      // background sleeping — next tick retries
    }
  }

  async function tick() {
    const settings = await readSettings()
    if (!settings.configured || settings.pollIntervalSeconds <= 0) return

    try {
      await chrome.runtime.sendMessage({
        type: "POLL_TICK",
        autoSync: settings.autoSyncTrades,
      })
    } catch {
      // background sleeping — next tick retries
    }
  }

  async function applySchedule() {
    const settings = await readSettings()
    clearTimer()
    lastInterval = settings.pollIntervalSeconds

    if (!settings.configured) return

    // Heartbeat + UI refresh queue — always, even when auto-sync poll is Off.
    void keepaliveTick()

    if (settings.pollIntervalSeconds <= 0) return

    void tick()
    timer = setInterval(tick, settings.pollIntervalSeconds * 1000)
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return
    if (changes.pollIntervalSeconds || changes.syncToken || changes.autoSyncTrades) {
      void applySchedule()
    }
  })

  void applySchedule()

  // Keep extension alive on TradingView — heartbeat + refresh queue every 15s.
  setInterval(() => {
    void keepaliveTick()
  }, 15_000)

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void keepaliveTick()
      void tick()
    }
  })
})()
