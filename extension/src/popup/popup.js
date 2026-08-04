/* global JBSync */

async function readStatusFromStorage() {
  const [sync, local] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)])
  return {
    config: {
      apiUrl: (sync.apiUrl || "http://localhost:3000").replace(/\/$/, ""),
      hasToken: Boolean((sync.syncToken || "").trim()),
    },
    local,
  }
}

async function loadStatus() {
  const errorEl = document.getElementById("error")
  const statusEl = document.getElementById("importStatus")

  try {
    const response = await readStatusFromStorage()
    document.getElementById("apiUrl").textContent = response.config.apiUrl || "—"
    document.getElementById("tokenStatus").textContent = response.config.hasToken ? "Configured" : "Missing"
    document.getElementById("lastSync").textContent = response.local?.lastSyncAt
      ? new Date(response.local.lastSyncAt).toLocaleTimeString()
      : "Never"
    document.getElementById("sessionImported").textContent = String(response.local?.sessionImported || 0)
    document.getElementById("dashboardLink").href = `${response.config.apiUrl}/live-sync`

    statusEl.textContent = response.local?.importMessage || "Ready"
    statusEl.style.color =
      response.local?.importStatus === "done"
        ? "#1a7f37"
        : response.local?.importStatus === "error"
          ? "#f85149"
          : response.local?.importStatus === "running"
            ? "#d29922"
            : "#8b949e"

    errorEl.textContent = response.local?.lastError || ""
    errorEl.style.color = response.local?.lastError ? "#f85149" : "#8b949e"
  } catch (error) {
    statusEl.textContent = "Error"
    statusEl.style.color = "#f85149"
    errorEl.textContent = error.message
  }
}

function setButtonsDisabled(disabled) {
  for (const id of ["testScrape", "importAll", "refreshNew"]) {
    document.getElementById(id).disabled = disabled
  }
}

async function saveRefreshResult(syncResult, result) {
  const { sessionImported = 0 } = await chrome.storage.local.get("sessionImported")
  const accountMsg = JBSync.formatByAccountMessage(syncResult.byAccount)
  const dedupedMsg = syncResult.deduped > 0 ? ` · removed ${syncResult.deduped} duplicate(s)` : ""
  const msg =
    syncResult.message ||
    `Added ${syncResult.imported} new, updated ${syncResult.updated}, skipped ${syncResult.skipped}${accountMsg}${dedupedMsg}`

  await chrome.storage.local.set({
    lastSyncAt: new Date().toISOString(),
    lastSyncResult: syncResult,
    importStatus: "done",
    importMessage: msg,
    sessionImported: sessionImported + (syncResult.imported || 0),
    lastError: "",
    lastDebug: result?.debug || null,
    lastByAccount: syncResult.byAccount || null,
  })

  return msg
}

document.getElementById("testScrape").addEventListener("click", async () => {
  const statusEl = document.getElementById("importStatus")
  const errorEl = document.getElementById("error")
  statusEl.textContent = "Testing scrape..."
  errorEl.textContent = ""
  setButtonsDisabled(true)

  try {
    const result = await JBSync.scrapeFromActiveTab(false)
    const count = result?.trades?.length ?? 0
    const debug = result?.debug || {}

    if (count) {
      statusEl.textContent = `Found ${count} trades`
      statusEl.style.color = "#1a7f37"
      errorEl.textContent = JSON.stringify(debug)
      errorEl.style.color = "#8b949e"
    } else {
      statusEl.textContent = result?.error || "0 trades found"
      statusEl.style.color = "#f85149"
      errorEl.textContent = JSON.stringify(debug)
    }
  } catch (error) {
    statusEl.textContent = `Scrape failed: ${error.message}`
    statusEl.style.color = "#f85149"
  } finally {
    setButtonsDisabled(false)
  }
})

document.getElementById("refreshNew").addEventListener("click", async () => {
  const statusEl = document.getElementById("importStatus")
  const errorEl = document.getElementById("error")
  statusEl.textContent = "Refreshing new trades..."
  errorEl.textContent = ""
  setButtonsDisabled(true)

  try {
    const config = await JBSync.getConfig()
    if (!config.syncToken) throw new Error("Add sync key in extension Options")

    await chrome.storage.local.set({
      importStatus: "running",
      importMessage: "Checking for new trades...",
      lastError: "",
    })

    const syncResult = await JBSync.refreshNewTrades(config)
    const msg = await saveRefreshResult(syncResult, syncResult.result)

    statusEl.textContent = msg
    statusEl.style.color = syncResult.message === "No new trades" ? "#8b949e" : "#1a7f37"
  } catch (error) {
    await chrome.storage.local.set({
      importStatus: "error",
      importMessage: error.message,
      lastError: error.message,
    })
    statusEl.textContent = error.message
    statusEl.style.color = "#f85149"
  } finally {
    setButtonsDisabled(false)
    await loadStatus()
  }
})

document.getElementById("importAll").addEventListener("click", async () => {
  const statusEl = document.getElementById("importStatus")
  const errorEl = document.getElementById("error")
  statusEl.textContent = "Scraping all trades..."
  errorEl.textContent = ""
  setButtonsDisabled(true)

  try {
    const config = await JBSync.getConfig()
    if (!config.syncToken) throw new Error("Add sync key in extension Options")

    await chrome.storage.local.set({
      importStatus: "running",
      importMessage: "Scraping TradingView...",
      lastError: "",
    })

    const result = await JBSync.scrapeFromActiveTab(true)
    if (!result?.trades?.length) throw new Error(result?.error || "No trades found")

    statusEl.textContent = `Syncing ${result.trades.length} trades...`
    const syncResult = await JBSync.syncTrades(result.trades, config)
    const msg = await saveRefreshResult(syncResult, result)

    statusEl.textContent = msg
    statusEl.style.color = "#1a7f37"
  } catch (error) {
    await chrome.storage.local.set({
      importStatus: "error",
      importMessage: error.message,
      lastError: error.message,
    })
    statusEl.textContent = error.message
    statusEl.style.color = "#f85149"
  } finally {
    setButtonsDisabled(false)
    await loadStatus()
  }
})

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local" || area === "sync") loadStatus()
})

loadStatus()
