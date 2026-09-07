import type { DeltaAutoTradeAccountResult } from "@/app/api/models/DeltaAutoTradeLog"
import { getDeltaCredentialsByAccountId } from "@/lib/broker/delta-credentials"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import { getDeltaProduct, getDeltaTickerPrice, getWalletBalances } from "@/lib/broker/delta-exchange"
import { getDeltaOrderMaxSize } from "@/lib/broker/delta-orders"
import {
  computeOrderTicketLots,
  marginRequiredUsd,
  normalizeDeltaProduct,
} from "@/lib/broker/delta-product"
import { normalizeDeltaWallet } from "@/lib/broker/delta-wallet"
import { getLeverageForSymbol, type DeltaAutoTradeConfig } from "@/lib/delta/auto-trade-settings"

export type AccountMarginEligibility = {
  accountId: string
  label: string
  marginUsd: number
}

export type AccountMarginIneligible = {
  accountId: string
  label: string
  reason: string
}

export type BroadcastSizingSuccess = {
  ok: true
  eligible: AccountMarginEligibility[]
  ineligible: AccountMarginIneligible[]
  lots: number
  markPrice: number
  leverage: number
}

export type BroadcastSizingFailure = {
  ok: false
  error: string
  eligible: AccountMarginEligibility[]
  ineligible: AccountMarginIneligible[]
}

export type BroadcastSizingResult = BroadcastSizingSuccess | BroadcastSizingFailure

export type AccountMarginSnapshot = {
  accountId: string
  label: string
  marginUsd: number | null
  loading?: boolean
  error?: string
}

const REASON_LABELS: Record<string, string> = {
  missing_credentials: "Missing credentials",
  wallet_unavailable: "Wallet unavailable",
  no_margin: "No available margin",
  insufficient_margin: "Insufficient margin for order size",
}

export function formatIneligibleReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

export function ineligibleToAccountResult(item: AccountMarginIneligible): DeltaAutoTradeAccountResult {
  return {
    accountId: item.accountId,
    label: item.label,
    ok: false,
    error: formatIneligibleReason(item.reason),
  }
}

export async function fetchAccountAvailableMargin(input: {
  userId: string
  accountId: string
  environment: DeltaEnvironment
}): Promise<
  | { ok: true; label: string; marginUsd: number; balanceUsd?: number }
  | { ok: false; label: string; reason: string }
> {
  const resolved = await getDeltaCredentialsByAccountId(input.userId, input.accountId, input.environment)
  if (!resolved) {
    return { ok: false, label: input.accountId, reason: "missing_credentials" }
  }

  try {
    const walletRaw = await getWalletBalances(resolved.creds, input.environment)
    const wallet = normalizeDeltaWallet(walletRaw)
    if (!wallet) {
      return { ok: false, label: resolved.account.label, reason: "wallet_unavailable" }
    }
    return {
      ok: true,
      label: resolved.account.label,
      marginUsd: wallet.availableMarginUsd,
      balanceUsd: wallet.totalBalanceUsd,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wallet unavailable"
    return { ok: false, label: resolved.account.label, reason: message }
  }
}

export async function classifyAccountMargins(input: {
  userId: string
  environment: DeltaEnvironment
  accountIds: string[]
  minMarginUsd?: number
}): Promise<{ eligible: AccountMarginEligibility[]; ineligible: AccountMarginIneligible[] }> {
  const minMargin = input.minMarginUsd ?? 0
  const results = await Promise.all(
    input.accountIds.map(async (accountId) => {
      const result = await fetchAccountAvailableMargin({
        userId: input.userId,
        accountId,
        environment: input.environment,
      })
      return { accountId, result }
    }),
  )

  const eligible: AccountMarginEligibility[] = []
  const ineligible: AccountMarginIneligible[] = []

  for (const { accountId, result } of results) {
    if (!result.ok) {
      ineligible.push({ accountId, label: result.label, reason: result.reason })
      continue
    }
    if (result.marginUsd <= minMargin) {
      ineligible.push({ accountId, label: result.label, reason: "no_margin" })
      continue
    }
    eligible.push({ accountId, label: result.label, marginUsd: result.marginUsd })
  }

  return { eligible, ineligible }
}

export async function resolveAutoTradeSizing(input: {
  userId: string
  environment: DeltaEnvironment
  accountIds: string[]
  symbol: string
  marginPct: number
  config: DeltaAutoTradeConfig
}): Promise<BroadcastSizingResult> {
  const [productRaw, ticker] = await Promise.all([
    getDeltaProduct(input.symbol, input.environment),
    getDeltaTickerPrice(input.symbol, input.environment).catch(() => null),
  ])
  const product = normalizeDeltaProduct(productRaw, ticker?.price)
  if (!product) {
    return { ok: false, error: `Delta product not found for ${input.symbol}`, eligible: [], ineligible: [] }
  }

  const markPrice = ticker?.price ?? product.markPrice ?? 0
  if (markPrice <= 0) {
    return { ok: false, error: "Mark price unavailable", eligible: [], ineligible: [] }
  }

  const leverage = getLeverageForSymbol(input.config, input.symbol, product.defaultLeverage)
  const { eligible, ineligible } = await classifyAccountMargins({
    userId: input.userId,
    environment: input.environment,
    accountIds: input.accountIds,
  })

  if (eligible.length === 0) {
    return {
      ok: false,
      error: "No available margin on target accounts",
      eligible,
      ineligible,
    }
  }

  const minMargin = Math.min(...eligible.map((a) => a.marginUsd))
  let lots = computeOrderTicketLots({
    availableMarginUsd: minMargin,
    pct: input.marginPct,
    contractValue: product.contractValue,
    markPrice,
    leverage,
    maxNotionalUsd: product.maxLeverageNotional > 0 ? product.maxLeverageNotional : undefined,
  })

  const maxSize = getDeltaOrderMaxSize(input.environment)
  lots = Math.min(lots, maxSize)
  if (lots < 1) {
    return {
      ok: false,
      error: "Calculated lot size below minimum",
      eligible,
      ineligible,
    }
  }

  return { ok: true, eligible, ineligible, lots, markPrice, leverage }
}

export async function resolveManualBroadcastAccounts(input: {
  userId: string
  environment: DeltaEnvironment
  accountIds: string[]
  symbol: string
  lots: number
  config?: DeltaAutoTradeConfig
  markPrice?: number
}): Promise<{ eligible: AccountMarginEligibility[]; ineligible: AccountMarginIneligible[] }> {
  let product = null as ReturnType<typeof normalizeDeltaProduct>
  let markPrice = input.markPrice ?? 0
  let leverage = 10

  if (input.markPrice == null || input.markPrice <= 0) {
    const [productRaw, ticker] = await Promise.all([
      getDeltaProduct(input.symbol, input.environment),
      getDeltaTickerPrice(input.symbol, input.environment).catch(() => null),
    ])
    product = normalizeDeltaProduct(productRaw, ticker?.price)
    markPrice = ticker?.price ?? product?.markPrice ?? 0
    leverage =
      product && input.config
        ? getLeverageForSymbol(input.config, input.symbol, product.defaultLeverage)
        : product?.defaultLeverage ?? 10
  } else {
    const productRaw = await getDeltaProduct(input.symbol, input.environment)
    product = normalizeDeltaProduct(productRaw, input.markPrice)
    leverage =
      product && input.config
        ? getLeverageForSymbol(input.config, input.symbol, product.defaultLeverage)
        : product?.defaultLeverage ?? 10
  }

  const requiredMargin =
    product && markPrice > 0
      ? marginRequiredUsd(input.lots, product.contractValue, markPrice, leverage)
      : 0

  const marginResults = await Promise.all(
    input.accountIds.map(async (accountId) => {
      const result = await fetchAccountAvailableMargin({
        userId: input.userId,
        accountId,
        environment: input.environment,
      })
      return { accountId, result }
    }),
  )

  const eligible: AccountMarginEligibility[] = []
  const ineligible: AccountMarginIneligible[] = []

  for (const { accountId, result } of marginResults) {
    if (!result.ok) {
      ineligible.push({ accountId, label: result.label, reason: result.reason })
      continue
    }
    if (result.marginUsd <= 0) {
      ineligible.push({ accountId, label: result.label, reason: "no_margin" })
      continue
    }
    if (requiredMargin > 0 && result.marginUsd < requiredMargin) {
      ineligible.push({ accountId, label: result.label, reason: "insufficient_margin" })
      continue
    }
    eligible.push({ accountId, label: result.label, marginUsd: result.marginUsd })
  }

  return { eligible, ineligible }
}
