export type TradePushDeepLink = {
  tradeId?: string
  kind?: "open" | "close"
  accountId?: string
}

export function buildTradePushUrl(options: TradePushDeepLink) {
  const params = new URLSearchParams()
  if (options.tradeId) params.set("trade", options.tradeId)
  if (options.kind) params.set("kind", options.kind)
  if (options.accountId) params.set("account", options.accountId)
  const query = params.toString()
  return query ? `/live-sync?${query}` : "/live-sync"
}

export function parseTradePushUrl(search: string): TradePushDeepLink {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const kind = params.get("kind")
  return {
    tradeId: params.get("trade") || undefined,
    kind: kind === "open" || kind === "close" ? kind : undefined,
    accountId: params.get("account") || undefined,
  }
}
