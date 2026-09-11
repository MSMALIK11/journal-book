import mongoose from "mongoose"
import DeltaOrderLog from "@/app/api/models/DeltaOrderLog"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import {
  getDeltaCredentialsByAccountId,
  getDefaultDeltaAccount,
  hasEnvDeltaCredentials,
  listDeltaAccounts,
  listEnabledDeltaAccounts,
} from "@/lib/broker/delta-credentials"
import { getDeltaProductMeta, placeOrder } from "@/lib/broker/delta-exchange"

export type DeltaOrderSide = "buy" | "sell"

export type DeltaBatchOrderResult = {
  accountId: string
  label: string
  ok: boolean
  brokerOrderId?: string
  symbol?: string
  side?: DeltaOrderSide
  size?: number
  error?: string
}

export function getDeltaSymbolCandidates(symbol: string): string[] {
  const normalized = symbol.toUpperCase()
  const candidates = [normalized]
  if (normalized.endsWith("USDT")) {
    candidates.push(normalized.slice(0, -4) + "USD")
  }
  return candidates.filter((candidate, idx) => candidates.indexOf(candidate) === idx)
}

export function resolveDeltaProductId(symbol: string, environment: DeltaEnvironment = "demo"): number | null {
  const normalized = symbol.toUpperCase()
  const raw =
    environment === "live"
      ? (process.env.DELTA_LIVE_PRODUCT_MAP_JSON ?? process.env.DELTA_PRODUCT_MAP_JSON)
      : process.env.DELTA_PRODUCT_MAP_JSON
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, number>
      if (map[normalized] != null) return Number(map[normalized])
    } catch {
      /* invalid env JSON is handled as missing mapping */
    }
  }
  const fallback =
    environment === "live"
      ? (process.env.DELTA_LIVE_FALLBACK_PRODUCT_ID ?? process.env.DELTA_FALLBACK_PRODUCT_ID)
      : process.env.DELTA_FALLBACK_PRODUCT_ID
  return fallback ? Number(fallback) : null
}

export type ResolvedDeltaProduct = {
  resolvedSymbol: string
  productId: number | null
}

export async function resolveDeltaProductForSymbol(
  symbol: string,
  environment: DeltaEnvironment,
): Promise<ResolvedDeltaProduct> {
  const symbolCandidates = getDeltaSymbolCandidates(symbol)
  for (const candidate of symbolCandidates) {
    const meta = await getDeltaProductMeta(candidate, environment)
    const productId = meta.id ?? resolveDeltaProductId(candidate, environment)
    if (productId != null) {
      return { resolvedSymbol: candidate, productId }
    }
  }
  return { resolvedSymbol: symbolCandidates[0], productId: null }
}

function brokerOrderId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || !("result" in raw)) return undefined
  const result = (raw as { result?: unknown }).result
  if (!result || typeof result !== "object" || !("id" in result)) return undefined
  const id = (result as { id?: unknown }).id
  return id == null ? undefined : String(id)
}

async function placeDeltaMarketOrderWithCreds(input: {
  userId: string
  accountId: string
  accountLabel: string
  environment: DeltaEnvironment
  creds: { apiKey: string; apiSecret: string }
  symbol: string
  side: DeltaOrderSide
  qty: number
  price?: number
  source?: "manual" | "auto"
  tvTradeId?: string
  resolvedProduct?: ResolvedDeltaProduct
}) {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    throw new Error("Delta order size must be a whole number of contracts")
  }

  const symbolCandidates = getDeltaSymbolCandidates(input.symbol)
  let resolvedSymbol = input.resolvedProduct?.resolvedSymbol ?? symbolCandidates[0]
  let productId = input.resolvedProduct?.productId ?? null

  if (input.resolvedProduct == null) {
    for (const candidate of symbolCandidates) {
      const meta = await getDeltaProductMeta(candidate, input.environment)
      const candidateProductId = meta.id ?? resolveDeltaProductId(candidate, input.environment)
      if (candidateProductId != null) {
        resolvedSymbol = candidate
        productId = candidateProductId
        break
      }
    }
  }

  let raw: Awaited<ReturnType<typeof placeOrder>> | null = null
  try {
    raw = await placeOrder(input.creds, input.environment, {
      ...(productId != null ? { product_id: productId } : { product_symbol: resolvedSymbol }),
      size: input.qty,
      side: input.side,
      order_type: "market_order",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (productId != null && message.includes("invalid_contract")) {
      let fallbackError: unknown = err
      for (const candidate of symbolCandidates) {
        try {
          raw = await placeOrder(input.creds, input.environment, {
            product_symbol: candidate,
            size: input.qty,
            side: input.side,
            order_type: "market_order",
          })
          fallbackError = null
          resolvedSymbol = candidate
          break
        } catch (candidateErr) {
          fallbackError = candidateErr
        }
      }
      if (fallbackError) throw fallbackError
    } else {
      throw err
    }
  }
  if (!raw) throw new Error("Delta order failed without response")

  const brokerId = brokerOrderId(raw)
  const brokerAccountObjectId =
    input.accountId !== "env" && mongoose.Types.ObjectId.isValid(input.accountId)
      ? new mongoose.Types.ObjectId(input.accountId)
      : undefined

  await DeltaOrderLog.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    environment: input.environment,
    brokerAccountId: brokerAccountObjectId,
    accountLabel: input.accountLabel,
    brokerOrderId: brokerId,
    symbol: resolvedSymbol,
    side: input.side,
    size: input.qty,
    price: input.price,
    source: input.source ?? "manual",
    tvTradeId: input.tvTradeId,
    raw: raw as Record<string, unknown>,
  })

  return {
    brokerOrderId: brokerId,
    productId: productId ?? null,
    symbol: resolvedSymbol,
    side: input.side,
    size: input.qty,
    price: input.price,
    raw,
  }
}

export async function placeDeltaMarketOrderForAccount(input: {
  userId: string | mongoose.Types.ObjectId
  accountId: string
  environment: DeltaEnvironment
  symbol: string
  side: DeltaOrderSide
  qty: number
  price?: number
  source?: "manual" | "auto"
  tvTradeId?: string
  resolvedProduct?: ResolvedDeltaProduct
}) {
  const userId = input.userId.toString()
  const resolved = await getDeltaCredentialsByAccountId(userId, input.accountId, input.environment)
  if (!resolved) {
    return { ok: false as const, reason: "missing_credentials" }
  }

  const placed = await placeDeltaMarketOrderWithCreds({
    userId,
    accountId: resolved.account.id,
    accountLabel: resolved.account.label,
    environment: input.environment,
    creds: resolved.creds,
    symbol: input.symbol,
    side: input.side,
    qty: input.qty,
    price: input.price,
    source: input.source,
    tvTradeId: input.tvTradeId,
    resolvedProduct: input.resolvedProduct,
  })

  return { ok: true as const, accountId: resolved.account.id, accountLabel: resolved.account.label, ...placed }
}

export async function placeDeltaMarketOrderForUser(input: {
  userId: string | mongoose.Types.ObjectId
  environment: DeltaEnvironment
  symbol: string
  side: DeltaOrderSide
  qty: number
  price?: number
}) {
  const userId = input.userId.toString()
  if (hasEnvDeltaCredentials(input.environment)) {
    return placeDeltaMarketOrderForAccount({ ...input, userId, accountId: "env" })
  }
  const defaultAccount = await getDefaultDeltaAccount(userId, input.environment)
  if (!defaultAccount) {
    return { ok: false as const, reason: "missing_credentials" }
  }
  return placeDeltaMarketOrderForAccount({
    ...input,
    userId,
    accountId: defaultAccount._id.toString(),
  })
}

export async function placeDeltaMarketOrderBatch(input: {
  userId: string | mongoose.Types.ObjectId
  environment: DeltaEnvironment
  accountIds: string[]
  symbol: string
  side: DeltaOrderSide
  qty: number
  price?: number
  source?: "manual" | "auto"
  tvTradeId?: string
}): Promise<{ results: DeltaBatchOrderResult[] }> {
  const userId = input.userId.toString()
  let targetIds = input.accountIds

  if (hasEnvDeltaCredentials(input.environment)) {
    targetIds = ["env"]
  } else if (targetIds.length === 0) {
    const accounts = await listEnabledDeltaAccounts(userId, input.environment)
    targetIds = accounts.map((a) => a.id)
  } else {
    const enabled = await listEnabledDeltaAccounts(userId, input.environment)
    const enabledSet = new Set(enabled.map((a) => a.id))
    targetIds = targetIds.filter((id) => enabledSet.has(id))
  }

  const resolvedProduct = await resolveDeltaProductForSymbol(input.symbol, input.environment)

  const settled = await Promise.allSettled(
    targetIds.map(async (accountId) => {
      const placed = await placeDeltaMarketOrderForAccount({
        userId,
        accountId,
        environment: input.environment,
        symbol: input.symbol,
        side: input.side,
        qty: input.qty,
        price: input.price,
        source: input.source,
        tvTradeId: input.tvTradeId,
        resolvedProduct,
      })
      if (!placed.ok) {
        throw new Error("missing_credentials")
      }
      return placed
    }),
  )

  const allAccounts = await listDeltaAccounts(userId, input.environment)
  const labelById = new Map(allAccounts.map((a) => [a.id, a.label]))
  if (hasEnvDeltaCredentials(input.environment)) {
    labelById.set("env", input.environment === "live" ? "Env override (live)" : "Env override")
  }

  const results: DeltaBatchOrderResult[] = settled.map((entry, index) => {
    const accountId = targetIds[index] ?? "unknown"
    const label = labelById.get(accountId) ?? accountId
    if (entry.status === "fulfilled") {
      return {
        accountId,
        label,
        ok: true,
        brokerOrderId: entry.value.brokerOrderId,
        symbol: entry.value.symbol,
        side: entry.value.side,
        size: entry.value.size,
      }
    }
    return {
      accountId,
      label,
      ok: false,
      error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
    }
  })

  return { results }
}

export function getDeltaTestOrderMaxSize(): number {
  const raw = Number(process.env.DELTA_TEST_ORDER_MAX_SIZE ?? 1)
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
}

export function getDeltaLiveOrderMaxSize(): number {
  const raw = Number(process.env.DELTA_LIVE_ORDER_MAX_SIZE ?? 5)
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 5
}

export function getDeltaOrderMaxSize(environment: DeltaEnvironment): number {
  return environment === "live" ? getDeltaLiveOrderMaxSize() : getDeltaTestOrderMaxSize()
}
