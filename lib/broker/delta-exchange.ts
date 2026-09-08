import crypto from "crypto"
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
  },
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
  }
  return deltaRequest<{ success?: boolean; result?: unknown }>(creds, "POST", "/v2/orders", environment, body)
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

export async function getDeltaProductMeta(
  symbol: string,
  environment: DeltaEnvironment = "demo",
): Promise<{ id: number | null; raw: Record<string, unknown> | null }> {
  const safeSymbol = symbol.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
  const base = getDeltaBaseUrl(environment)
  const res = await fetch(`${base}/v2/products/${encodeURIComponent(safeSymbol)}`, {
    headers: { Accept: "application/json" },
  })
  const json = (await res.json().catch(() => ({}))) as {
    result?: Record<string, unknown> & { id?: number | string }
  }
  if (!res.ok || !json.result) return { id: null, raw: null }
  const id = Number(json.result.id)
  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    raw: json.result,
  }
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
): Promise<{ price: number; productId?: number }> {
  const safeSymbol = symbol.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
  const base = getDeltaBaseUrl(environment)
  const res = await fetch(`${base}/v2/tickers/${encodeURIComponent(safeSymbol)}`, {
    headers: { Accept: "application/json" },
  })
  const json = (await res.json().catch(() => ({}))) as {
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
    error?: unknown
  }
  if (!res.ok) {
    throw new Error(json.error ? String(json.error) : `Delta ticker ${res.status}`)
  }
  const result = json.result
  const rawPrice =
    result?.mark_price ??
    result?.last_price ??
    result?.spot_price ??
    result?.close ??
    result?.close_price ??
    result?.price ??
    result?.quotes?.best_ask ??
    result?.quotes?.best_bid
  const price = Number(rawPrice)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Delta ticker did not return a valid price for ${safeSymbol}`)
  }
  return { price, productId: result?.product_id }
}

export async function testDeltaConnection(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
): Promise<{ ok: true; positionCount: number }> {
  const response = await getPositions(creds, environment)
  const positions = Array.isArray(response.result) ? response.result : []
  return { ok: true, positionCount: positions.length }
}
