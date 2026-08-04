export type ExtensionSyncResult = {
  ok?: boolean
  imported?: number
  updated?: number
  skipped?: number
  deduped?: number
  synced?: number
  message?: string
  error?: string
  finishedAt?: string
}

const SYNC_TIMEOUT_MS = 20_000
const BRIDGE_WAIT_MS = 2_000
const SERVER_POLL_MS = 2_000
const SERVER_POLL_MAX = 45

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function pingBridge(timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      document.removeEventListener("jb-bridge-pong", onPong)
      resolve(false)
    }, timeoutMs)

    function onPong() {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      document.removeEventListener("jb-bridge-pong", onPong)
      resolve(true)
    }

    document.addEventListener("jb-bridge-pong", onPong)
    document.dispatchEvent(new CustomEvent("jb-bridge-ping"))
  })
}

function isBridgeReady() {
  return typeof document !== "undefined" && Boolean(document.getElementById("jb-extension-bridge"))
}

async function waitForBridge(maxMs = BRIDGE_WAIT_MS) {
  if (isBridgeReady()) return true
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    if (await pingBridge(400)) return true
    if (isBridgeReady()) return true
    await sleep(100)
  }
  return false
}

function requestExtensionSyncViaBridge(): Promise<ExtensionSyncResult> {
  return new Promise((resolve, reject) => {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now())

    const timeout = window.setTimeout(() => {
      document.removeEventListener("jb-sync-response", onResponse)
      reject(new Error("Extension bridge timed out"))
    }, SYNC_TIMEOUT_MS)

    function onResponse(event: Event) {
      const detail = (event as CustomEvent<{ requestId?: string; error?: string; result?: ExtensionSyncResult }>)
        .detail
      if (!detail || detail.requestId !== requestId) return

      window.clearTimeout(timeout)
      document.removeEventListener("jb-sync-response", onResponse)

      if (detail.error) {
        reject(new Error(String(detail.error)))
        return
      }

      resolve(detail.result ?? {})
    }

    document.addEventListener("jb-sync-response", onResponse)
    document.dispatchEvent(new CustomEvent("jb-sync-request", { detail: { requestId } }))
  })
}

async function waitForServerRefresh(
  fetchStatus: () => Promise<{
    pending?: boolean
    refreshRequested?: boolean
    lastResult?: ExtensionSyncResult | null
  }>,
  queuedAt: number,
): Promise<ExtensionSyncResult | null> {
  for (let attempt = 0; attempt < SERVER_POLL_MAX; attempt += 1) {
    await sleep(SERVER_POLL_MS)
    const status = await fetchStatus()

    const stillPending = status.pending === true || status.refreshRequested === true
    if (stillPending) continue

    if (status.lastResult) {
      const finishedAt = status.lastResult.finishedAt
      if (typeof finishedAt === "string" && new Date(finishedAt).getTime() >= queuedAt - 2000) {
        return status.lastResult
      }
      if (!finishedAt && (status.pending === false || status.refreshRequested === false)) {
        return status.lastResult
      }
    }

    if (status.pending === false || status.refreshRequested === false) {
      return status.lastResult ?? null
    }
  }

  return null
}

export function formatExtensionSyncSummary(result: ExtensionSyncResult | null | undefined): string {
  if (!result) {
    return "Sync timed out — reload extension, keep journal or TradingView tab open, try again"
  }
  if (result.error) return String(result.error)
  if (result.message === "No new trades") return "No new trades on TradingView"
  if (result.message === "Open trade already up to date") return "Open trade already up to date"
  if (result.message?.includes("updated") || result.message?.includes("synced")) {
    return String(result.message)
  }

  const parts: string[] = []
  if (result.imported) parts.push(`${result.imported} new`)
  if (result.updated) parts.push(`${result.updated} updated`)
  if (result.skipped) parts.push(`${result.skipped} skipped`)

  return parts.length ? parts.join(" · ") : "Journal reloaded"
}

/** Queue sync on server, then try bridge or wait for extension poll. */
export async function requestExtensionSync(options: {
  queueRefresh: () => Promise<number>
  fetchRefreshStatus: () => Promise<{
    pending?: boolean
    refreshRequested?: boolean
    lastResult?: ExtensionSyncResult | null
  }>
}): Promise<ExtensionSyncResult | null> {
  const queuedAt = await options.queueRefresh()

  if (await waitForBridge()) {
    try {
      const result = await requestExtensionSyncViaBridge()
      return result
    } catch {
      // Fall through to server poll when bridge fails mid-flight.
    }
  }

  return waitForServerRefresh(options.fetchRefreshStatus, queuedAt)
}
