const fields = ["apiUrl", "syncToken", "assetType", "pollIntervalSeconds", "autoSyncTrades"]

function formatPollLabel(seconds) {
  if (seconds <= 0) return null
  if (seconds < 60) return `${seconds} seconds`
  const minutes = seconds / 60
  if (seconds % 60 === 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`
  }
  return `${seconds} seconds`
}

async function loadOptions() {
  const stored = await chrome.storage.sync.get(fields)
  for (const field of fields) {
    const el = document.getElementById(field)
    if (!el) continue
    if (field === "autoSyncTrades") {
      // Default ON for new installs so TV fills hit the journal UI + alarm quickly.
      el.checked = stored.autoSyncTrades === undefined ? true : Boolean(stored.autoSyncTrades)
      continue
    }
    if (stored[field] !== undefined) {
      el.value = String(stored[field])
    } else if (field === "pollIntervalSeconds") {
      el.value = "15"
    }
  }
}

function readPayload() {
  return {
    apiUrl: document.getElementById("apiUrl").value.trim() || "http://localhost:3000",
    syncToken: document.getElementById("syncToken").value.trim(),
    assetType: document.getElementById("assetType").value,
    pollIntervalSeconds: Number(document.getElementById("pollIntervalSeconds").value),
    autoSyncTrades: document.getElementById("autoSyncTrades").checked,
  }
}

/** Live/production domains are optional permissions — ask on save (user gesture). */
async function ensureHostPermission(apiUrl) {
  let pattern
  try {
    pattern = `${new URL(apiUrl).origin}/*`
  } catch {
    return { ok: false, error: "API URL looks invalid — use https://your-app.vercel.app" }
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(pattern)) return { ok: true }

  // Request directly — awaiting permissions.contains() first can drop the user gesture.
  // Chrome resolves true without a prompt when the origin is already granted.
  const granted = await chrome.permissions.request({ origins: [pattern] }).catch(() => false)
  if (!granted) {
    return { ok: false, error: `Permission denied for ${pattern} — allow it so sync can reach your live site` }
  }
  return { ok: true }
}

async function testConnection(payload) {
  const response = await fetch(`${payload.apiUrl.replace(/\/$/, "")}/api/sync/verify`, {
    headers: {
      "X-Sync-Key": payload.syncToken,
      Authorization: `Bearer ${payload.syncToken}`,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || "Invalid sync key — regenerate in journal-book Profile")
  }
  return data
}

document.getElementById("save").addEventListener("click", async () => {
  const savedEl = document.getElementById("saved")
  savedEl.textContent = "Saving..."
  try {
    const payload = readPayload()
    const permission = await ensureHostPermission(payload.apiUrl)
    if (!permission.ok) throw new Error(permission.error)

    await chrome.storage.sync.set(payload)
    await chrome.runtime.sendMessage({ type: "REGISTER_JOURNAL_BRIDGE" }).catch(() => {})
    await testConnection(payload)
    savedEl.textContent = payload.pollIntervalSeconds
      ? `Settings saved. Poll every ${formatPollLabel(payload.pollIntervalSeconds)}.`
      : "Settings saved. Manual sync only (polling off)."
    savedEl.style.color = "#1a7f37"
  } catch (error) {
    savedEl.textContent = error.message
    savedEl.style.color = "#cf222e"
  }
})

document.getElementById("test").addEventListener("click", async () => {
  const savedEl = document.getElementById("saved")
  savedEl.textContent = "Testing..."
  try {
    const data = await testConnection(readPayload())
    savedEl.textContent = `Connected as ${data.email}`
    savedEl.style.color = "#1a7f37"
  } catch (error) {
    savedEl.textContent = error.message
    savedEl.style.color = "#cf222e"
  }
})

loadOptions()
