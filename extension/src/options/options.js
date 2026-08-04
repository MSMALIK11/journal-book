const fields = ["apiUrl", "syncToken", "assetType", "pollIntervalSeconds", "autoSyncTrades"]

async function loadOptions() {
  const stored = await chrome.storage.sync.get(fields)
  for (const field of fields) {
    const el = document.getElementById(field)
    if (!el) continue
    if (field === "autoSyncTrades") {
      el.checked = Boolean(stored.autoSyncTrades)
      continue
    }
    if (stored[field] !== undefined) {
      el.value = String(stored[field])
    } else if (field === "pollIntervalSeconds") {
      el.value = "30"
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
    await chrome.storage.sync.set(payload)
    await testConnection(payload)
    savedEl.textContent = payload.pollIntervalSeconds
      ? `Settings saved. Poll every ${payload.pollIntervalSeconds}s.`
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
