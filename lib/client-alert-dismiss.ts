import { authFetch } from "@/lib/client-auth"

/** Mark alert keys read on the server so every device stops showing them. */
export async function dismissAlertsByKeys(keys: string[], accountId?: string) {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return
  await authFetch("/api/alerts/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: unique, accountId }),
  })
}

export function newTradeAlertKey(tradeId: string) {
  return `new-trade:${tradeId}`
}

export function tradeClosedAlertKey(tradeId: string) {
  return `trade-closed:${tradeId}`
}

export function tradeAlarmSeenKey(accountId: string, tradeId: string) {
  return `${accountId}:${tradeId}:alarm`
}

/** Keys persisted when a trade alarm / fill alert is dismissed on any device. */
export function tradeAlertDismissKeys(accountId: string, tradeId: string) {
  return [
    newTradeAlertKey(tradeId),
    tradeClosedAlertKey(tradeId),
    tradeAlarmSeenKey(accountId, tradeId),
  ]
}

/** Merge server read/dismiss keys into local seen set so alarms do not re-ring. */
export function applyServerReadKeysToSeen(
  readKeys: string[],
  accountId: string,
  seen: Set<string>,
) {
  for (const key of readKeys) {
    const newTrade = key.match(/^new-trade:(.+)$/)
    if (newTrade?.[1]) seen.add(tradeAlarmSeenKey(accountId, newTrade[1]))

    const closed = key.match(/^trade-closed:(.+)$/)
    if (closed?.[1]) seen.add(tradeAlarmSeenKey(accountId, closed[1]))

    if (key.endsWith(":alarm")) seen.add(key)
  }
}

export function isTradeAlarmDismissed(
  readKeys: string[],
  accountId: string,
  tradeId: string,
) {
  if (!accountId || !tradeId) return false
  const dismissKeys = tradeAlertDismissKeys(accountId, tradeId)
  return dismissKeys.some((key) => readKeys.includes(key))
}
