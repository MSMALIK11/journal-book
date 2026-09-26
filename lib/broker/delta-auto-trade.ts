import mongoose from "mongoose"
import connectDB from "@/app/api/db/mongoose"
import DeltaAutoTradeLog, {
  type DeltaAutoTradeAccountResult,
  type DeltaAutoTradeBracketStatus,
  type DeltaAutoTradeLogStatus,
} from "@/app/api/models/DeltaAutoTradeLog"
import DeltaOrderLog from "@/app/api/models/DeltaOrderLog"
import Trade from "@/app/api/models/Trade"
import User from "@/app/api/models/User"
import { closeDeltaPosition } from "@/lib/broker/delta-close"
import {
  getDeltaCredentialsByAccountId,
  hasEnvDeltaCredentials,
  listEnabledDeltaAccounts,
  type DeltaAccountSummary,
} from "@/lib/broker/delta-credentials"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import {
  ineligibleToAccountResult,
  resolveAutoTradeSizing,
} from "@/lib/broker/delta-broadcast-sizing"
import {
  getDeltaProductId,
  getDeltaProductMeta,
  getDeltaTickerPrice,
  getPositions,
  parseAverageFillPrice,
} from "@/lib/broker/delta-exchange"
import { persistDeltaTradeNotifications } from "@/lib/delta/delta-trade-notifications"
import { isServerLiveTradingBlocked } from "@/lib/broker/delta-live-guard"
import {
  editDeltaBracketForOrder,
  getDeltaSymbolCandidates,
  placeDeltaMarketOrderBatch,
  placeDeltaMarketOrderForAccount,
  resolveDeltaProductId,
  type DeltaBracketContext,
  type DeltaMarketOrderBracket,
} from "@/lib/broker/delta-orders"
import { normalizeDeltaPositions } from "@/lib/broker/delta-positions"
import { mapTvInstrumentToDelta, isEnabledAutoTradeSymbol } from "@/lib/broker/delta-symbol-map"
import {
  getDeltaAutoTradeConfig,
  type DeltaAutoTradeConfig,
} from "@/lib/delta/auto-trade-settings"
import {
  computeDeltaBracketLevels,
  getDeltaTickSize,
} from "@/lib/trading/delta-bracket-levels"
import { parseSignalLevels } from "@/lib/trading/signal-levels"
import type { LiveFillEvent } from "@/lib/trading/live-fill-alerts"

const ENVIRONMENTS: DeltaEnvironment[] = ["demo", "live"]

const SCALP_FILL_REASONS = new Set(["recent_scalp_open", "recent_scalp_close"])

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: number }).code
  return code === 11000
}

function isLongTradeType(tradeType: string): boolean {
  const normalized = tradeType.trim().toLowerCase()
  return normalized === "buy" || normalized === "long"
}

function tvSideToDeltaSide(tradeType: string, kind: "open" | "close"): "buy" | "sell" {
  const isBuy = isLongTradeType(tradeType)
  if (kind === "open") return isBuy ? "buy" : "sell"
  return isBuy ? "sell" : "buy"
}

function positionSideFromTradeType(tradeType: string): "long" | "short" {
  return isLongTradeType(tradeType) ? "long" : "short"
}

async function resolveAutoTradeSymbol(
  mappedSymbol: string,
  environment: DeltaEnvironment,
): Promise<string | null> {
  const candidates = getDeltaSymbolCandidates(mappedSymbol)
  for (const candidate of candidates) {
    const productId =
      (await getDeltaProductId(candidate, environment)) ?? resolveDeltaProductId(candidate, environment)
    if (productId != null) return candidate
  }
  return null
}

function resolveTargetAccountIds(
  config: DeltaAutoTradeConfig,
  enabledAccounts: DeltaAccountSummary[],
): string[] {
  if (enabledAccounts.length === 0) return []

  if (config.tradeMode === "single") {
    if (config.singleAccountId && enabledAccounts.some((a) => a.id === config.singleAccountId)) {
      return [config.singleAccountId]
    }
    const fallback = enabledAccounts.find((a) => a.isDefault) ?? enabledAccounts[0]
    return fallback ? [fallback.id] : []
  }

  const selected = (config.broadcastAccountIds ?? []).filter((id) =>
    enabledAccounts.some((a) => a.id === id),
  )
  if (selected.length > 0) return selected
  return enabledAccounts.map((a) => a.id)
}

async function claimAutoTradeExecution(input: {
  userId: string
  environment: DeltaEnvironment
  tvTradeId: string
  fillReason: string
  kind: "open" | "close"
}): Promise<boolean> {
  try {
    await DeltaAutoTradeLog.create({
      userId: new mongoose.Types.ObjectId(input.userId),
      environment: input.environment,
      tvTradeId: input.tvTradeId,
      fillReason: input.fillReason,
      kind: input.kind,
      status: "skipped",
    })
    return true
  } catch (error) {
    if (isDuplicateKeyError(error)) return false
    throw error
  }
}

async function finalizeAutoTradeLog(input: {
  userId: string
  environment: DeltaEnvironment
  tvTradeId: string
  fillReason: string
  kind: "open" | "close"
  status: DeltaAutoTradeLogStatus
  symbol?: string
  side?: "buy" | "sell"
  lots?: number
  tvInstrument?: string
  tvTradeType?: string
  tvSl?: number
  tvTp?: number
  deltaSl?: number
  deltaTp?: number
  deltaFillPrice?: number
  bracketStatus?: DeltaAutoTradeBracketStatus
  accountResults?: DeltaAutoTradeAccountResult[]
  error?: string
}) {
  await DeltaAutoTradeLog.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(input.userId),
      environment: input.environment,
      tvTradeId: input.tvTradeId,
      fillReason: input.fillReason,
      kind: input.kind,
    },
    {
      $set: {
        status: input.status,
        symbol: input.symbol,
        side: input.side,
        lots: input.lots,
        tvInstrument: input.tvInstrument,
        tvTradeType: input.tvTradeType,
        tvSl: input.tvSl,
        tvTp: input.tvTp,
        deltaSl: input.deltaSl,
        deltaTp: input.deltaTp,
        deltaFillPrice: input.deltaFillPrice,
        bracketStatus: input.bracketStatus,
        accountResults: input.accountResults,
        error: input.error,
      },
    },
  )
}

async function resolveFillTradeLevels(fill: LiveFillEvent) {
  let stopLoss = fill.trade.stop_loss
  let target = fill.trade.target
  let signal = fill.trade.signal

  if (stopLoss == null || target == null) {
    const trade = await Trade.findById(fill.trade.id).select("stop_loss target signal").lean()
    if (stopLoss == null && typeof trade?.stop_loss === "number") stopLoss = trade.stop_loss
    if (target == null && typeof trade?.target === "number") target = trade.target
    if (!signal && trade?.signal) signal = trade.signal
  }

  if (stopLoss == null || target == null) {
    const parsed = parseSignalLevels(signal ?? fill.trade.signal)
    if (stopLoss == null && parsed.stopLoss != null) stopLoss = parsed.stopLoss
    if (target == null && parsed.takeProfit != null) target = parsed.takeProfit
  }

  return { stopLoss, target }
}

async function resolveOpenBracket(input: {
  config: DeltaAutoTradeConfig
  fill: LiveFillEvent
  symbol: string
  environment: DeltaEnvironment
  markPrice: number
}): Promise<{
  bracket?: DeltaMarketOrderBracket
  tickSize?: number
  tvSl?: number
  tvTp?: number
  bracketStatus: DeltaAutoTradeBracketStatus
  bracketNote?: string
}> {
  const { stopLoss: tvSl, target: tvTp } = await resolveFillTradeLevels(input.fill)
  if (input.config.attachTvBrackets === false) {
    return { tvSl, tvTp, bracketStatus: "none", bracketNote: "attachTvBrackets_disabled" }
  }

  const productMeta = await getDeltaProductMeta(input.symbol, input.environment)
  const tickSize = getDeltaTickSize(productMeta.raw)
  const computed = computeDeltaBracketLevels({
    tradeType: input.fill.trade.trade_type,
    tvEntry: input.fill.trade.entry_price,
    tvSl,
    tvTp,
    deltaAnchor: input.markPrice,
    tickSize,
  })

  if (computed.stopLoss == null && computed.takeProfit == null) {
    return {
      tvSl,
      tvTp,
      tickSize,
      bracketStatus: "skipped",
      bracketNote: computed.skippedReason,
    }
  }

  return {
    tvSl,
    tvTp,
    tickSize,
    bracket: {
      stopLoss: computed.stopLoss,
      takeProfit: computed.takeProfit,
    },
    bracketStatus: "attached",
    bracketNote: computed.skippedReason,
  }
}

function summarizeBracketFromResults(results: DeltaAutoTradeAccountResult[]) {
  const successful = results.filter((r) => r.ok)
  const first = successful.find((r) => r.deltaSl != null || r.deltaTp != null || r.bracketStatus)
  const bracketErrors = results
    .map((r) => r.bracketError)
    .filter(Boolean)
    .join("; ")
  return {
    deltaSl: first?.deltaSl,
    deltaTp: first?.deltaTp,
    deltaFillPrice: first?.deltaFillPrice,
    bracketStatus: first?.bracketStatus,
    bracketErrors: bracketErrors || undefined,
  }
}

async function executeAutoTradeOpen(input: {
  userId: string
  environment: DeltaEnvironment
  config: DeltaAutoTradeConfig
  fill: LiveFillEvent
  symbol: string
  side: "buy" | "sell"
  accountIds: string[]
}) {
  const fillReason = input.fill.reason
  const sizing = await resolveAutoTradeSizing({
    userId: input.userId,
    environment: input.environment,
    accountIds: input.accountIds,
    symbol: input.symbol,
    marginPct: input.config.marginPct,
    config: input.config,
    priceFallback: input.fill.trade.entry_price,
  })

  if (!sizing.ok) {
    const accountResults = sizing.ineligible.map(ineligibleToAccountResult)
    const status: DeltaAutoTradeLogStatus =
      sizing.ineligible.length > 0 && sizing.eligible.length === 0 ? "skipped" : "failed"
    await finalizeAutoTradeLog({
      userId: input.userId,
      environment: input.environment,
      tvTradeId: input.fill.trade.id,
      fillReason,
      kind: "open",
      status,
      symbol: input.symbol,
      side: input.side,
      tvInstrument: input.fill.trade.instrument,
      tvTradeType: input.fill.trade.trade_type,
      accountResults,
      error: sizing.error,
    })
    await persistDeltaTradeNotifications(input.userId, input.environment, {
      source: "auto",
      kind: "open",
      tvTradeId: input.fill.trade.id,
      symbol: input.symbol,
      side: input.side,
      status,
      accountResults,
      error: sizing.error,
    })
    return
  }

  const { lots, markPrice, eligible, ineligible } = sizing
  const targetIds = eligible.map((a) => a.accountId)
  let results: DeltaAutoTradeAccountResult[] = ineligible.map(ineligibleToAccountResult)
  const bracketPlan = await resolveOpenBracket({
    config: input.config,
    fill: input.fill,
    symbol: input.symbol,
    environment: input.environment,
    markPrice,
  })
  const bracketContext: DeltaBracketContext = {
    tradeType: input.fill.trade.trade_type,
    tvEntry: input.fill.trade.entry_price,
    tvSl: bracketPlan.tvSl,
    tvTp: bracketPlan.tvTp,
  }

  if (targetIds.length === 1) {
    const placed = await placeDeltaMarketOrderForAccount({
      userId: input.userId,
      accountId: targetIds[0],
      environment: input.environment,
      symbol: input.symbol,
      side: input.side,
      qty: lots,
      price: markPrice,
      source: "auto",
      tvTradeId: input.fill.trade.id,
      bracket: bracketPlan.bracket,
      bracketContext,
      tickSize: bracketPlan.tickSize,
    })
    results = [
      ...results,
      placed.ok
        ? {
            accountId: placed.accountId,
            label: placed.accountLabel,
            ok: true,
            brokerOrderId: placed.brokerOrderId,
            deltaFillPrice: placed.deltaFillPrice,
            deltaSl: placed.deltaSl,
            deltaTp: placed.deltaTp,
            bracketStatus: placed.bracketStatus ?? bracketPlan.bracketStatus,
            bracketError: placed.bracketError,
          }
        : {
            accountId: targetIds[0],
            label: eligible[0]?.label ?? targetIds[0],
            ok: false,
            error: placed.reason,
          },
    ]
  } else {
    const batch = await placeDeltaMarketOrderBatch({
      userId: input.userId,
      environment: input.environment,
      accountIds: targetIds,
      symbol: input.symbol,
      side: input.side,
      qty: lots,
      price: markPrice,
      source: "auto",
      tvTradeId: input.fill.trade.id,
      bracket: bracketPlan.bracket,
      bracketContext,
      tickSize: bracketPlan.tickSize,
    })
    results = [
      ...results,
      ...batch.results.map((r) => ({
        accountId: r.accountId,
        label: r.label,
        ok: r.ok,
        brokerOrderId: r.brokerOrderId,
        error: r.error,
        deltaFillPrice: r.deltaFillPrice,
        deltaSl: r.deltaSl,
        deltaTp: r.deltaTp,
        bracketStatus: r.bracketStatus ?? bracketPlan.bracketStatus,
        bracketError: r.bracketError,
      })),
    ]
  }

  const okCount = results.filter((r) => r.ok).length
  const status: DeltaAutoTradeLogStatus =
    okCount === 0 ? "failed" : okCount === results.length ? "success" : "partial"
  const bracketSummary = summarizeBracketFromResults(results)
  const errors = [
    okCount === 0 ? results.map((r) => r.error).filter(Boolean).join("; ") : undefined,
    bracketSummary.bracketErrors,
    bracketPlan.bracketNote,
  ]
    .filter(Boolean)
    .join("; ")

  await finalizeAutoTradeLog({
    userId: input.userId,
    environment: input.environment,
    tvTradeId: input.fill.trade.id,
    fillReason,
    kind: "open",
    status,
    symbol: input.symbol,
    side: input.side,
    lots,
    tvInstrument: input.fill.trade.instrument,
    tvTradeType: input.fill.trade.trade_type,
    tvSl: bracketPlan.tvSl,
    tvTp: bracketPlan.tvTp,
    deltaSl: bracketSummary.deltaSl,
    deltaTp: bracketSummary.deltaTp,
    deltaFillPrice: bracketSummary.deltaFillPrice,
    bracketStatus: bracketSummary.bracketStatus ?? bracketPlan.bracketStatus,
    accountResults: results,
    error: errors || undefined,
  })
  await persistDeltaTradeNotifications(input.userId, input.environment, {
    source: "auto",
    kind: "open",
    tvTradeId: input.fill.trade.id,
    symbol: input.symbol,
    side: input.side,
    lots,
    status,
    accountResults: results,
    error: okCount === 0 ? results.map((r) => r.error).filter(Boolean).join("; ") : undefined,
  })
}

async function executeAutoTradeClose(input: {
  userId: string
  environment: DeltaEnvironment
  fill: LiveFillEvent
  symbol: string
  accountIds: string[]
}) {
  const fillReason = input.fill.reason
  const positionSide = positionSideFromTradeType(input.fill.trade.trade_type)
  const results: DeltaAutoTradeAccountResult[] = []

  for (const accountId of input.accountIds) {
    const resolved = await getDeltaCredentialsByAccountId(input.userId, accountId, input.environment)
    if (!resolved) {
      results.push({ accountId, label: accountId, ok: false, error: "missing_credentials" })
      continue
    }

    try {
      const positionsResponse = await getPositions(resolved.creds, input.environment)
      const positions = normalizeDeltaPositions(positionsResponse.result)
      const symbolCandidates = new Set(getDeltaSymbolCandidates(input.symbol))
      const match = positions.find(
        (p) => symbolCandidates.has(p.symbol.toUpperCase()) && p.side === positionSide && p.size > 0,
      )

      if (!match) {
        results.push({
          accountId,
          label: resolved.account.label,
          ok: false,
          error: "no_matching_position",
        })
        continue
      }

      await closeDeltaPosition(resolved.creds, input.environment, {
        symbol: match.symbol,
        side: positionSide,
        size: Math.max(1, Math.floor(match.size)),
      })

      results.push({ accountId, label: resolved.account.label, ok: true })
    } catch (error) {
      results.push({
        accountId,
        label: resolved.account.label,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  const status: DeltaAutoTradeLogStatus =
    okCount === 0 ? "failed" : okCount === results.length ? "success" : "partial"

  await finalizeAutoTradeLog({
    userId: input.userId,
    environment: input.environment,
    tvTradeId: input.fill.trade.id,
    fillReason,
    kind: "close",
    status,
    symbol: input.symbol,
    side: tvSideToDeltaSide(input.fill.trade.trade_type, "close"),
    tvInstrument: input.fill.trade.instrument,
    tvTradeType: input.fill.trade.trade_type,
    accountResults: results,
    error: okCount === 0 ? results.map((r) => r.error).filter(Boolean).join("; ") : undefined,
  })
  await persistDeltaTradeNotifications(input.userId, input.environment, {
    source: "auto",
    kind: "close",
    tvTradeId: input.fill.trade.id,
    symbol: input.symbol,
    side: tvSideToDeltaSide(input.fill.trade.trade_type, "close"),
    status,
    accountResults: results,
    error: okCount === 0 ? results.map((r) => r.error).filter(Boolean).join("; ") : undefined,
  })
}

async function processFillForEnvironment(
  userId: string,
  environment: DeltaEnvironment,
  fill: LiveFillEvent,
  config: DeltaAutoTradeConfig,
) {
  if (!config.enabled) return

  if (SCALP_FILL_REASONS.has(fill.reason)) return

  if (environment === "live" && isServerLiveTradingBlocked()) {
    return
  }

  const enabledAccounts = await listEnabledDeltaAccounts(userId, environment)
  if (enabledAccounts.length === 0 && !hasEnvDeltaCredentials(environment)) {
    return
  }

  const accountIds = resolveTargetAccountIds(config, enabledAccounts)
  if (accountIds.length === 0 && !hasEnvDeltaCredentials(environment)) {
    return
  }

  const mapped = mapTvInstrumentToDelta(fill.trade.instrument)
  if (!mapped || !isEnabledAutoTradeSymbol(config.symbols, mapped)) return

  const claimed = await claimAutoTradeExecution({
    userId,
    environment,
    tvTradeId: fill.trade.id,
    fillReason: fill.reason,
    kind: fill.kind,
  })
  if (!claimed) return

  const symbol = await resolveAutoTradeSymbol(mapped, environment)
  if (!symbol) {
    await finalizeAutoTradeLog({
      userId,
      environment,
      tvTradeId: fill.trade.id,
      fillReason: fill.reason,
      kind: fill.kind,
      status: "skipped",
      tvInstrument: fill.trade.instrument,
      tvTradeType: fill.trade.trade_type,
      error: "Could not resolve Delta symbol",
    })
    await persistDeltaTradeNotifications(userId, environment, {
      source: "auto",
      kind: fill.kind,
      tvTradeId: fill.trade.id,
      status: "skipped",
      error: "Could not resolve Delta symbol",
    })
    return
  }

  const effectiveAccountIds = hasEnvDeltaCredentials(environment) ? ["env"] : accountIds

  try {
    if (fill.kind === "open") {
      const side = tvSideToDeltaSide(fill.trade.trade_type, "open")
      await executeAutoTradeOpen({
        userId,
        environment,
        config,
        fill,
        symbol,
        side,
        accountIds: effectiveAccountIds,
      })
    } else {
      await executeAutoTradeClose({
        userId,
        environment,
        fill,
        symbol,
        accountIds: effectiveAccountIds,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finalizeAutoTradeLog({
      userId,
      environment,
      tvTradeId: fill.trade.id,
      fillReason: fill.reason,
      kind: fill.kind,
      status: "failed",
      symbol,
      tvInstrument: fill.trade.instrument,
      tvTradeType: fill.trade.trade_type,
      error: message,
    })
    await persistDeltaTradeNotifications(userId, environment, {
      source: "auto",
      kind: fill.kind,
      tvTradeId: fill.trade.id,
      symbol,
      status: "failed",
      error: message,
    })
  }
}

export type DeltaBracketLevelUpdate = {
  tradeId: string
  instrument: string
  trade_type: string
  entry_price: number
  stop_loss?: number
  target?: number
}

export async function runDeltaBracketUpdatesForOpenTrades(
  userId: string,
  updates: DeltaBracketLevelUpdate[],
) {
  if (updates.length === 0) return

  await connectDB()
  const user = await User.findById(userId).select("deltaAutoTradePreferences").lean()
  if (!user) return

  for (const update of updates) {
    if (update.stop_loss == null && update.target == null) continue

    for (const environment of ENVIRONMENTS) {
      const config = getDeltaAutoTradeConfig(user.deltaAutoTradePreferences, environment)
      if (!config.enabled || config.attachTvBrackets === false) continue
      if (environment === "live" && isServerLiveTradingBlocked()) continue

      const mapped = mapTvInstrumentToDelta(update.instrument)
      if (!mapped || !isEnabledAutoTradeSymbol(config.symbols, mapped)) continue

      const symbol = await resolveAutoTradeSymbol(mapped, environment)
      if (!symbol) continue

      const orderLog = await DeltaOrderLog.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        environment,
        tvTradeId: update.tradeId,
        source: "auto",
      })
        .sort({ createdAt: -1 })
        .lean()

      if (!orderLog?.brokerOrderId) continue

      const productMeta = await getDeltaProductMeta(orderLog.symbol, environment)
      const tickSize = getDeltaTickSize(productMeta.raw)
      const anchor =
        parseAverageFillPrice(orderLog.raw) ??
        orderLog.price ??
        (await getDeltaTickerPrice(orderLog.symbol, environment).catch(() => null))?.price

      if (!anchor) continue

      const computed = computeDeltaBracketLevels({
        tradeType: update.trade_type,
        tvEntry: update.entry_price,
        tvSl: update.stop_loss,
        tvTp: update.target,
        deltaAnchor: anchor,
        tickSize,
      })

      if (computed.stopLoss == null && computed.takeProfit == null) continue

      const accountId =
        hasEnvDeltaCredentials(environment) || !orderLog.brokerAccountId
          ? "env"
          : orderLog.brokerAccountId.toString()

      try {
        await editDeltaBracketForOrder({
          userId,
          accountId,
          environment,
          brokerOrderId: orderLog.brokerOrderId,
          productId: productMeta.id,
          symbol: orderLog.symbol,
          bracket: {
            stopLoss: computed.stopLoss,
            takeProfit: computed.takeProfit,
          },
        })
      } catch (error) {
        console.error("Delta bracket update failed:", error)
      }
    }
  }
}

export async function runDeltaAutoTradeForFills(userId: string, fills: LiveFillEvent[]) {
  if (fills.length === 0) return

  await connectDB()
  const user = await User.findById(userId).select("deltaAutoTradePreferences").lean()
  if (!user) return

  for (const fill of fills) {
    for (const environment of ENVIRONMENTS) {
      const config = getDeltaAutoTradeConfig(user.deltaAutoTradePreferences, environment)
      await processFillForEnvironment(userId, environment, fill, config)
    }
  }
}

export async function getRecentAutoTradeLogs(userId: string, environment: DeltaEnvironment, limit = 5) {
  await connectDB()
  const logs = await DeltaAutoTradeLog.find({
    userId: new mongoose.Types.ObjectId(userId),
    environment,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()

  return logs.map((log) => ({
    id: log._id.toString(),
    kind: log.kind,
    status: log.status,
    symbol: log.symbol,
    side: log.side,
    lots: log.lots,
    tvInstrument: log.tvInstrument,
    tvSl: log.tvSl,
    tvTp: log.tvTp,
    deltaSl: log.deltaSl,
    deltaTp: log.deltaTp,
    deltaFillPrice: log.deltaFillPrice,
    bracketStatus: log.bracketStatus,
    error: log.error,
    accountResults: log.accountResults,
    createdAt: log.createdAt,
  }))
}
