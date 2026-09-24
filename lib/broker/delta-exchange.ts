import crypto from "crypto"
import https from "node:https"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"

export const DELTA_DEMO_BASE_URL = "https://cdn-ind.testnet.deltaex.org"
export const DELTA_LIVE_BASE_URL = "https://api.india.delta.exchange"

export type DeltaCredentials = {
  apiKey: string
  apiSecret: string
}

function sign(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex")
}

function deltaErrorMessage(json: unknown, fallback: string, environment: DeltaEnvironment): string {
  if (!json || typeof json !== "object" || !("error" in json)) return fallback
  const error = (json as { error?: unknown }).error
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (code === "invalid_api_key") {
      return environment === "live"
        ? "Invalid API key — live keys must be created at delta.exchange and used with the production API"
        : "Invalid API key — demo keys must be created at demo.delta.exchange and used with the testnet API"
    }
    if (code === "ip_not_whitelisted_for_api_key") {
      const context = (error as { context?: { client_ip?: unknown } }).context
      const clientIp = typeof context?.client_ip === "string" ? context.client_ip : null
      return clientIp
        ? `IP not whitelisted — add ${clientIp} to this API key's allowed IPs on Delta`
        : "IP not whitelisted — add this server's IP to the API key's allowed IPs on Delta"
    }
    return `Delta API error: ${String(code)}`
  }
  return fallback
}

export function getDeltaBaseUrl(environment: DeltaEnvironment = "demo"): string {
  if (environment === "live") return DELTA_LIVE_BASE_URL
  const configured = process.env.DELTA_BASE_URL?.trim()
  if (configured) return configured.replace(/\/$/, "")
  return DELTA_DEMO_BASE_URL
}

const DELTA_PUBLIC_HEADERS = {
  Accept: "application/json",
  // Delta demo CDN rejects Node fetch/undici unless the request looks like curl.
  "User-Agent": "curl/8.7.1",
}

type DeltaPublicResponse = {
  ok: boolean
  status: number
  json: unknown
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function deltaPublicGetOnce(url: string, timeoutMs: number): Promise<DeltaPublicResponse> {
  return new Promise((resolve) => {
    const fail = (status: number) => resolve({ ok: false, status, json: {} })
    const req = https.get(url, { headers: DELTA_PUBLIC_HEADERS }, (res) => {
      let data = ""
      res.on("data", (chunk) => {
        data += chunk
      })
      res.on("end", () => {
        let json: unknown = {}
        try {
          json = JSON.parse(data)
        } catch {
          json = { raw: data }
        }
        const status = res.statusCode ?? 0
        resolve({ ok: status >= 200 && status < 300, status, json })
      })
    })
    req.on("error", () => fail(0))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      fail(504)
    })
  })
}

async function deltaPublicGet(url: string, timeoutMs = 8_000): Promise<DeltaPublicResponse> {
  const retryable = new Set([429, 500, 502, 503, 504])
  let last: DeltaPublicResponse = { ok: false, status: 0, json: {} }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    last = await deltaPublicGetOnce(url, timeoutMs)
    if (last.ok || !retryable.has(last.status) || attempt === 1) return last
    await sleep(200 * (attempt + 1))
  }
  return last
}

async function deltaRequest<T>(
  creds: DeltaCredentials,
  method: string,
  path: string,
  environment: DeltaEnvironment,
  body?: Record<string, unknown>,
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyStr = body && Object.keys(body).length ? JSON.stringify(body) : ""
  const message = method + timestamp + path + bodyStr
  const sig = sign(creds.apiSecret, message)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "api-key": creds.apiKey,
    timestamp,
    signature: sig,
  }

  const base = getDeltaBaseUrl(environment)
  const url = base + path
  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr ? bodyStr : undefined,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }

  if (res.ok) return json as T

  const message_ = deltaErrorMessage(
    json,
    res.status === 401
      ? `Delta Unauthorized: check API key Trade permission, IP whitelist, API secret, and ${environment} environment`
      : res.statusText,
    environment,
  )
  throw new Error(message_)
}

export type DeltaBracketOrderParams = {
  bracket_stop_loss_price?: string
  bracket_take_profit_price?: string
  bracket_stop_trigger_method?: "mark_price" | "last_traded_price" | "spot_price"
}

export async function placeOrder(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
  params: {
    product_id?: number | string
    product_symbol?: string
    size: number
    side: "buy" | "sell"
    order_type: "market_order" | "limit_order"
    limit_price?: string
    reduce_only?: boolean
  } & DeltaBracketOrderParams,
) {
  if (params.product_id == null && !params.product_symbol) {
    throw new Error("Either product_id or product_symbol is required")
  }
  const body = {
    ...(params.product_id != null ? { product_id: params.product_id } : {}),
    ...(params.product_symbol ? { product_symbol: params.product_symbol } : {}),
    size: params.size,
    side: params.side,
    order_type: params.order_type,
    ...(params.limit_price ? { limit_price: params.limit_price } : {}),
    ...(params.reduce_only ? { reduce_only: true } : {}),
    ...(params.bracket_stop_loss_price ? { bracket_stop_loss_price: params.bracket_stop_loss_price } : {}),
    ...(params.bracket_take_profit_price ? { bracket_take_profit_price: params.bracket_take_profit_price } : {}),
    ...(params.bracket_stop_trigger_method
      ? { bracket_stop_trigger_method: params.bracket_stop_trigger_method }
      : {}),
  }
  return deltaRequest<{ success?: boolean; result?: unknown }>(creds, "POST", "/v2/orders", environment, body)
}

export async function editBracketOrder(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
  params: {
    id: number | string
    product_id?: number | string
    product_symbol?: string
  } & DeltaBracketOrderParams,
) {
  const body: Record<string, unknown> = {
    id: params.id,
    ...(params.product_id != null ? { product_id: params.product_id } : {}),
    ...(params.product_symbol ? { product_symbol: params.product_symbol } : {}),
    ...(params.bracket_stop_loss_price ? { bracket_stop_loss_price: params.bracket_stop_loss_price } : {}),
    ...(params.bracket_take_profit_price ? { bracket_take_profit_price: params.bracket_take_profit_price } : {}),
    ...(params.bracket_stop_trigger_method
      ? { bracket_stop_trigger_method: params.bracket_stop_trigger_method }
      : {}),
  }
  return deltaRequest<{ success?: boolean; result?: unknown }>(
    creds,
    "PUT",
    "/v2/orders/bracket",
    environment,
    body,
  )
}

export async function createPositionBracketOrder(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
  params: {
    product_id?: number | string
    product_symbol?: string
    stopLoss?: number
    takeProfit?: number
    stopTriggerMethod?: "mark_price" | "last_traded_price" | "spot_price"
  },
) {
  if (params.product_id == null && !params.product_symbol) {
    throw new Error("Either product_id or product_symbol is required")
  }
  if (params.stopLoss == null && params.takeProfit == null) {
    throw new Error("At least one of stopLoss or takeProfit is required")
  }

  const formatPrice = (price: number) => {
    const raw = price.toString()
    if (raw.includes("e") || raw.includes("E")) {
      return price.toFixed(8).replace(/\.?0+$/, "")
    }
    return raw
  }

  const body: Record<string, unknown> = {
    ...(params.product_id != null ? { product_id: params.product_id } : {}),
    ...(params.product_symbol ? { product_symbol: params.product_symbol } : {}),
    bracket_stop_trigger_method: params.stopTriggerMethod ?? "mark_price",
  }

  if (params.stopLoss != null) {
    body.stop_loss_order = {
      order_type: "market_order",
      stop_price: formatPrice(params.stopLoss),
    }
  }
  if (params.takeProfit != null) {
    body.take_profit_order = {
      order_type: "market_order",
      stop_price: formatPrice(params.takeProfit),
    }
  }

  return deltaRequest<{ success?: boolean; result?: unknown }>(
    creds,
    "POST",
    "/v2/orders/bracket",
    environment,
    body,
  )
}

export function parseAverageFillPrice(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object" || !("result" in raw)) return undefined
  const result = (raw as { result?: unknown }).result
  if (!result || typeof result !== "object" || !("average_fill_price" in result)) return undefined
  const price = Number((result as { average_fill_price?: unknown }).average_fill_price)
  return Number.isFinite(price) && price > 0 ? price : undefined
}

export async function closeAllPositions(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
  params?: { productId?: number | string; closeAllPortfolio?: boolean; closeAllIsolated?: boolean },
) {
  const body: Record<string, unknown> = {
    close_all_portfolio: params?.closeAllPortfolio ?? true,
    close_all_isolated: params?.closeAllIsolated ?? true,
  }
  if (params?.productId != null) {
    body.product_id = params.productId
  }
  return deltaRequest<{ success?: boolean; result?: unknown }>(
    creds,
    "POST",
    "/v2/positions/close_all",
    environment,
    body,
  )
}

export async function getPositions(creds: DeltaCredentials, environment: DeltaEnvironment) {
  return deltaRequest<{ result?: unknown[] }>(creds, "GET", "/v2/positions/margined", environment)
}

export async function getWalletBalances(creds: DeltaCredentials, environment: DeltaEnvironment) {
  return deltaRequest<{ result?: unknown[] }>(creds, "GET", "/v2/wallet/balances", environment)
}

export async function setProductLeverage(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
  productId: number | string,
  leverage: number,
) {
  return deltaRequest<{ success?: boolean; result?: unknown }>(
    creds,
    "POST",
    `/v2/products/${productId}/orders/leverage`,
    environment,
    { leverage: String(leverage) },
  )
}

const productCatalogCache = new Map<
  string,
  { fetchedAt: number; bySymbol: Map<string, Record<string, unknown>> }
>()
const catalogInflight = new Map<string, Promise<Map<string, Record<string, unknown>>>>()
const productMetaCache = new Map<string, { fetchedAt: number; meta: { id: number | null; raw: Record<string, unknown> | null } }>()
const PRODUCT_CATALOG_TTL_MS = 60_000
const PRODUCT_META_TTL_MS = 5 * 60_000

/** Demo testnet fallbacks when Delta CDN intermittently 500s (notably BTCUSD). */
const DEMO_PRODUCT_FALLBACKS: Record<string, Record<string, unknown>> = {
  BTCUSD: {
    id: 84,
    symbol: "BTCUSD",
    contract_value: "0.001",
    contract_unit_currency: "BTC",
    default_leverage: "10",
    max_leverage_notional: "10000",
  },
  ETHUSD: {
    id: 1699,
    symbol: "ETHUSD",
    contract_value: "0.01",
    contract_unit_currency: "ETH",
    default_leverage: "10",
    max_leverage_notional: "10000",
  },
  SOLUSD: {
    id: 92572,
    symbol: "SOLUSD",
    contract_value: "1",
    contract_unit_currency: "SOL",
    default_leverage: "10",
    max_leverage_notional: "10000",
  },
  XAUTUSD: {
    id: 181689,
    symbol: "XAUTUSD",
    contract_value: "0.001",
    contract_unit_currency: "XAUT",
    default_leverage: "10",
    max_leverage_notional: "10000",
  },
}

function deltaSymbolCandidates(symbol: string): string[] {
  const normalized = symbol.toUpperCase().replace(/[^A-Za-z0-9]/g, "")
  const candidates = [normalized]
  if (normalized.endsWith("USDT")) {
    candidates.push(`${normalized.slice(0, -4)}USD`)
  }
  if (["XAUUSD", "XAUUSDT", "XAU", "GOLD", "XAUT", "XAUTUSD"].includes(normalized)) {
    candidates.push("XAUTUSD")
  }
  if (normalized === "BTC") candidates.push("BTCUSD")
  if (normalized === "ETH") candidates.push("ETHUSD")
  if (normalized === "SOL") candidates.push("SOLUSD")
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index)
}

function productMetaFromRaw(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return { id: null, raw: null as Record<string, unknown> | null }
  const id = Number(raw.id)
  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    raw,
  }
}

async function fetchDeltaProductBySymbol(
  symbol: string,
  environment: DeltaEnvironment,
): Promise<{ id: number | null; raw: Record<string, unknown> | null }> {
  const safeSymbol = symbol.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
  const base = getDeltaBaseUrl(environment)
  const { ok, json } = await deltaPublicGet(`${base}/v2/products/${encodeURIComponent(safeSymbol)}`)
  const parsed = json as { result?: Record<string, unknown> & { id?: number | string } }
  if (!ok || !parsed.result) return { id: null, raw: null }
  return productMetaFromRaw(parsed.result)
}

async function loadDeltaProductCatalog(environment: DeltaEnvironment) {
  const cacheKey = getDeltaBaseUrl(environment)
  const cached = productCatalogCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < PRODUCT_CATALOG_TTL_MS) {
    return cached.bySymbol
  }

  const inflight = catalogInflight.get(cacheKey)
  if (inflight) return inflight

  const promise = (async () => {
    const base = getDeltaBaseUrl(environment)
    const { ok, json } = await deltaPublicGet(`${base}/v2/products`, 15_000)
    const parsed = json as { result?: Record<string, unknown>[] }
    const bySymbol = new Map<string, Record<string, unknown>>()
    if (ok && Array.isArray(parsed.result)) {
      for (const row of parsed.result) {
        if (!row || typeof row !== "object") continue
        const symbol = typeof row.symbol === "string" ? row.symbol.toUpperCase() : ""
        if (symbol) bySymbol.set(symbol, row)
      }
    }

    productCatalogCache.set(cacheKey, { fetchedAt: Date.now(), bySymbol })
    catalogInflight.delete(cacheKey)
    return bySymbol
  })()

  catalogInflight.set(cacheKey, promise)
  return promise
}

async function fetchDeltaProductFromCatalog(
  symbol: string,
  environment: DeltaEnvironment,
): Promise<{ id: number | null; raw: Record<string, unknown> | null }> {
  const catalog = await loadDeltaProductCatalog(environment)
  for (const candidate of deltaSymbolCandidates(symbol)) {
    const row = catalog.get(candidate)
    if (row) return productMetaFromRaw(row)
  }
  return { id: null, raw: null }
}

async function fetchDeltaProductFromTicker(
  symbol: string,
  environment: DeltaEnvironment,
): Promise<{ id: number | null; raw: Record<string, unknown> | null }> {
  const safeSymbol = symbol.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
  const base = getDeltaBaseUrl(environment)
  const { ok, json } = await deltaPublicGet(`${base}/v2/tickers/${encodeURIComponent(safeSymbol)}`)
  const parsed = json as {
    result?: Record<string, unknown> & {
      product_id?: number | string
      contract_value?: string | number
      underlying_asset_symbol?: string
      leverage?: string | number
      max_leverage_notional?: string | number
      symbol?: string
    }
  }
  if (!ok || !parsed.result) return { id: null, raw: null }

  const result = parsed.result
  const productId = Number(result.product_id)
  const contractValue = Number(result.contract_value)
  if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(contractValue) || contractValue <= 0) {
    return { id: null, raw: null }
  }

  return productMetaFromRaw({
    id: productId,
    symbol: typeof result.symbol === "string" ? result.symbol : safeSymbol,
    contract_value: contractValue,
    contract_unit_currency:
      typeof result.underlying_asset_symbol === "string" ? result.underlying_asset_symbol : "USD",
    default_leverage: Number(result.leverage) > 0 ? Number(result.leverage) : 10,
    max_leverage_notional: Number(result.max_leverage_notional) || 0,
  })
}

function fetchDemoProductFallback(
  symbol: string,
  environment: DeltaEnvironment,
): { id: number | null; raw: Record<string, unknown> | null } {
  if (environment !== "demo") return { id: null, raw: null }
  for (const candidate of deltaSymbolCandidates(symbol)) {
    const row = DEMO_PRODUCT_FALLBACKS[candidate]
    if (row) return productMetaFromRaw(row)
  }
  return { id: null, raw: null }
}

export async function getDeltaProductMeta(
  symbol: string,
  environment: DeltaEnvironment = "demo",
): Promise<{ id: number | null; raw: Record<string, unknown> | null }> {
  const cacheKey = `${getDeltaBaseUrl(environment)}:${symbol.toUpperCase()}`
  const cached = productMetaCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < PRODUCT_META_TTL_MS) {
    return cached.meta
  }

  let meta: { id: number | null; raw: Record<string, unknown> | null } = { id: null, raw: null }

  if (environment === "demo") {
    // Demo CDN often 500s or hangs on /v2/products/{symbol} — use instant local map first.
    meta = fetchDemoProductFallback(symbol, environment)
  } else {
    for (const candidate of deltaSymbolCandidates(symbol)) {
      const direct = await fetchDeltaProductBySymbol(candidate, environment)
      if (direct.raw) {
        meta = direct
        break
      }
    }
  }

  if (!meta.raw) {
    meta = await fetchDeltaProductFromCatalog(symbol, environment)
  }

  if (!meta.raw) {
    for (const candidate of deltaSymbolCandidates(symbol)) {
      const fromTicker = await fetchDeltaProductFromTicker(candidate, environment)
      if (fromTicker.raw) {
        meta = fromTicker
        break
      }
    }
  }

  if (!meta.raw) {
    meta = fetchDemoProductFallback(symbol, environment)
  }

  if (meta.raw) {
    productMetaCache.set(cacheKey, { fetchedAt: Date.now(), meta })
  }

  return meta
}

export async function getDeltaProduct(
  symbol: string,
  environment: DeltaEnvironment = "demo",
): Promise<Record<string, unknown> | null> {
  const meta = await getDeltaProductMeta(symbol, environment)
  return meta.raw
}

export async function getDeltaProductId(
  symbol: string,
  environment: DeltaEnvironment = "demo",
): Promise<number | null> {
  const meta = await getDeltaProductMeta(symbol, environment)
  return meta.id
}

export async function getDeltaTickerPrice(
  symbol: string,
  environment: DeltaEnvironment = "demo",
): Promise<{ price: number | null; productId?: number }> {
  for (const candidate of deltaSymbolCandidates(symbol)) {
    const safeSymbol = candidate.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
    const base = getDeltaBaseUrl(environment)
    const { ok, json } = await deltaPublicGet(`${base}/v2/tickers/${encodeURIComponent(safeSymbol)}`)
    const parsed = json as {
      result?: {
        product_id?: number
        mark_price?: string | number
        spot_price?: string | number
        close?: string | number
        close_price?: string | number
        last_price?: string | number
        price?: string | number
        quotes?: {
          best_bid?: string | number
          best_ask?: string | number
        }
      }
    }
    if (!ok || !parsed.result) continue

    const result = parsed.result
    const rawPrice =
      result.mark_price ??
      result.last_price ??
      result.spot_price ??
      result.close ??
      result.close_price ??
      result.price ??
      result.quotes?.best_ask ??
      result.quotes?.best_bid
    const price = Number(rawPrice)
    if (!Number.isFinite(price) || price <= 0) continue
    return { price, productId: result.product_id }
  }

  return { price: null }
}

export async function testDeltaConnection(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
): Promise<{ ok: true; positionCount: number }> {
  const response = await getPositions(creds, environment)
  const positions = Array.isArray(response.result) ? response.result : []
  return { ok: true, positionCount: positions.length }
}
