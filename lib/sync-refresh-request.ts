import User from "@/app/api/models/User"

export const SYNC_REFRESH_TTL_MS = 120_000

type RefreshEntry = {
  requestedAt: number
  lastResult: Record<string, unknown> | null
}

const globalStore = globalThis as typeof globalThis & {
  __jbSyncRefreshQueue?: Map<string, RefreshEntry>
}

function queueStore() {
  if (!globalStore.__jbSyncRefreshQueue) {
    globalStore.__jbSyncRefreshQueue = new Map()
  }
  return globalStore.__jbSyncRefreshQueue
}

export function isSyncRefreshPending(requestedAt?: Date | null) {
  if (!requestedAt) return false
  return Date.now() - requestedAt.getTime() < SYNC_REFRESH_TTL_MS
}

function isMemoryPending(userId: string) {
  const entry = queueStore().get(userId)
  if (!entry?.requestedAt) return false
  return Date.now() - entry.requestedAt < SYNC_REFRESH_TTL_MS
}

export function isRefreshPendingForUser(userId: string, mongoRequestedAt?: Date | null) {
  if (isMemoryPending(userId)) return true
  return isSyncRefreshPending(mongoRequestedAt)
}

export async function requestSyncRefresh(userId: string) {
  const at = new Date()
  queueStore().set(userId, { requestedAt: at.getTime(), lastResult: null })

  // Best-effort persist (may be ignored if mongoose model was cached before schema update).
  try {
    await User.updateOne({ _id: userId }, { $set: { sync_refresh_requested_at: at } })
  } catch (error) {
    console.warn("Could not persist sync refresh flag:", error)
  }

  return { at, pending: true }
}

export async function getSyncRefreshState(userId: string) {
  const memory = queueStore().get(userId)
  if (isMemoryPending(userId)) {
    return { pending: true, lastResult: memory?.lastResult ?? null }
  }

  if (memory?.lastResult) {
    return { pending: false, lastResult: memory.lastResult }
  }

  const user = await User.findById(userId)
    .select("sync_refresh_requested_at sync_refresh_last_result")
    .lean()

  if (!user) return { pending: false, lastResult: null as Record<string, unknown> | null }

  return {
    pending: isSyncRefreshPending(user.sync_refresh_requested_at),
    lastResult: (user.sync_refresh_last_result as Record<string, unknown> | null) ?? null,
  }
}

export async function completeSyncRefresh(userId: string, result: Record<string, unknown>) {
  const finished = { ...result, finishedAt: new Date().toISOString() }
  queueStore().set(userId, { requestedAt: 0, lastResult: finished })

  try {
    await User.updateOne(
      { _id: userId },
      {
        $unset: { sync_refresh_requested_at: "" },
        $set: { sync_refresh_last_result: finished },
      },
    )
  } catch (error) {
    console.warn("Could not persist sync refresh result:", error)
  }
}
