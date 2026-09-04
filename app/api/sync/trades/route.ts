import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { canonicalInstrumentSymbol, resolveAccountForInstrument } from "@/lib/trading/account-match"
import { mapTradingViewTrade } from "@/lib/trading/tradingview-mapper"
import { dropSupersededOpenTradesFromPayload, priceMatchesInstrument } from "@/lib/trading/price-sanity"
import { closeDuplicateLiveOpens, healIncompleteTvCloses, reconcileStaleOpenTrades } from "@/lib/trading/reconcile-open-trades"
import { isOpenSyncedTrade, isOpenTvTrade, markPaintedOpenTrades } from "@/lib/trading/tradingview-open"
import { dedupeSyncedTradesByExternalId, findExistingSyncedTrade, shouldMigrateExternalId } from "@/lib/trading/sync-dedup"
import { formatAccount, getUserAccounts, reconcileTradeAccounts, resolveOrCreateAccountForInstrument } from "@/lib/trading-accounts-server"
import { publishAccountsUpdated, publishTradesUpdated } from "@/lib/sync-events"
import { recordTradeSyncEvent } from "@/lib/sync-last-event"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"
import { touchSyncHeartbeat } from "@/lib/sync-heartbeat"
import {
  flushLiveFillAlerts,
  isRealLiveClose,
  isRecentScalp,
  type LiveFillEvent,
  type LiveFillTrade,
} from "@/lib/trading/live-fill-alerts"
import { withUserSyncLock } from "@/lib/trading/sync-lock"
import { tradingViewSyncSchema } from "@/lib/validations/tradingview-sync"

function mergeSyncedTrade(
  existing: InstanceType<typeof Trade>,
  mapped: ReturnType<typeof mapTradingViewTrade>,
  accountId: string,
) {
  if (existing.accountId !== accountId) {
    existing.accountId = accountId
  }

  if (shouldMigrateExternalId(existing, mapped) && mapped.external_id) {
    existing.external_id = mapped.external_id
  }

  existing.entry_date = mapped.entry_date
  existing.entry_price = mapped.entry_price
  existing.instrument = mapped.instrument
  existing.trade_type = mapped.trade_type
  existing.strategy = mapped.strategy
  existing.signal = mapped.signal

  if (mapped.exit_date) {
    existing.exit_date = mapped.exit_date
    if (mapped.exit_price != null) existing.exit_price = mapped.exit_price
  } else {
    existing.set("exit_date", null)
    existing.set("exit_price", null)
  }

  if (typeof mapped.net_pnl === "number") existing.net_pnl = mapped.net_pnl
  if (typeof mapped.return_pct === "number") existing.return_pct = mapped.return_pct
  if (typeof mapped.commission === "number") existing.commission = mapped.commission
  if (mapped.tags?.length) existing.tags = mapped.tags
}

function syncedTradeChanged(
  existing: InstanceType<typeof Trade>,
  mapped: ReturnType<typeof mapTradingViewTrade>,
): boolean {
  // Live TV Open paints MTM time/price every poll — that is not a new fill.
  const stillOpen = !mapped.exit_date && !existing.exit_date
  if (stillOpen) return false

  if (shouldMigrateExternalId(existing, mapped)) return true
  if (existing.entry_date?.getTime() !== mapped.entry_date.getTime()) return true
  if (Boolean(mapped.exit_date) !== Boolean(existing.exit_date)) return true
  if (mapped.exit_date && existing.exit_date?.getTime() !== mapped.exit_date.getTime()) return true
  if (mapped.exit_date && !existing.exit_date) return true
  if (!mapped.exit_date && existing.exit_date) return true
  if (mapped.exit_price != null && existing.exit_price !== mapped.exit_price) return true
  if (!mapped.exit_date && existing.exit_price != null) return true

  if (typeof mapped.net_pnl === "number" && existing.net_pnl !== mapped.net_pnl) return true
  if (typeof mapped.return_pct === "number" && existing.return_pct !== mapped.return_pct) return true
  if (typeof mapped.commission === "number" && existing.commission !== mapped.commission) return true
  if (mapped.signal && existing.signal !== mapped.signal) return true
  return false
}

function closeFillTrade(
  snapshot: {
    id: string
    instrument: string
    trade_type: string
    entry_date: string
    entry_price: number
    signal?: string | null
    is_open?: boolean
  },
  mapped: ReturnType<typeof mapTradingViewTrade>,
): LiveFillTrade {
  return {
    ...snapshot,
    is_open: false,
    exit_date: mapped.exit_date?.toISOString(),
    exit_price: mapped.exit_price ?? undefined,
    net_pnl: typeof mapped.net_pnl === "number" ? mapped.net_pnl : undefined,
    return_pct: typeof mapped.return_pct === "number" ? mapped.return_pct : undefined,
  }
}

export async function OPTIONS(request: NextRequest) {
  return withSyncCors(request, new NextResponse(null, { status: 204 }))
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getSyncAuth(request)
    if (!auth) {
      return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const body = await request.json()
    const parsed = tradingViewSyncSchema.safeParse(body)
    if (!parsed.success) {
      return withSyncCors(
        request,
        NextResponse.json(
          { error: "Invalid trade payload", fields: parsed.error.flatten().fieldErrors },
          { status: 400 },
        ),
      )
    }

    await connectDB()

    return await withUserSyncLock(auth.userId, async () => {
    let accounts = await getUserAccounts(auth.userId)
    const newAccounts: { id: string; name: string }[] = []
    const seenAccountIds = new Set<string>()

    function trackNewAccount(account: { _id?: unknown; name: string }, created: boolean) {
      if (!created) return
      const id = String(account._id)
      if (seenAccountIds.has(id)) return
      seenAccountIds.add(id)
      newAccounts.push({ id, name: account.name })
    }

    if (parsed.data.chartSymbol) {
      const chartSymbol = canonicalInstrumentSymbol(parsed.data.chartSymbol)
      const ensured = await resolveOrCreateAccountForInstrument(auth.userId, chartSymbol, accounts)
      accounts = ensured.accounts
      trackNewAccount(ensured.account, ensured.created)
    }

    const chartSymbolOverride = parsed.data.chartSymbol
      ? canonicalInstrumentSymbol(parsed.data.chartSymbol)
      : null

    if (parsed.data.trades.length === 0) {
      let closedStale = 0
      if (parsed.data.reconcileOpens) {
        closedStale = await reconcileStaleOpenTrades(
          auth.userId,
          parsed.data.reconcileOpens.instrument,
          parsed.data.reconcileOpens.opens,
        )
      }
      const healResult = await healIncompleteTvCloses(auth.userId)
      closedStale += healResult.healed
      if (closedStale > 0) {
        const refreshTargets = new Map<
          string,
          { accountId: string; instrument: string; accountName: string; updated: number }
        >()
        const symbol = canonicalInstrumentSymbol(
          parsed.data.reconcileOpens?.instrument || chartSymbolOverride || "",
        )
        if (symbol && parsed.data.reconcileOpens) {
          const account = resolveAccountForInstrument(accounts, symbol)
          refreshTargets.set(String(account._id), {
            accountId: String(account._id),
            instrument: symbol,
            accountName: account.name,
            updated: closedStale - healResult.healed,
          })
        }
        for (const touch of healResult.touches) {
          const existing = refreshTargets.get(touch.accountId)
          if (existing) {
            existing.updated += touch.updated
            continue
          }
          const account = resolveAccountForInstrument(accounts, touch.instrument)
          refreshTargets.set(touch.accountId, {
            accountId: touch.accountId,
            instrument: touch.instrument,
            accountName: account.name,
            updated: touch.updated,
          })
        }

        for (const target of refreshTargets.values()) {
          const latestTrade = {
            id: `closed:${target.accountId}`,
            instrument: target.instrument,
            trade_type: "Buy" as const,
            entry_date: new Date().toISOString(),
            entry_price: 0,
            is_open: false,
          }
          const event = await recordTradeSyncEvent(auth.userId, {
            kind: "close",
            accountId: target.accountId,
            accountName: target.accountName,
            imported: 0,
            updated: target.updated,
            skipped: 0,
            latestTrade,
          })
          publishTradesUpdated(auth.userId, target.accountId, {
            eventId: event.eventId,
            kind: "close",
            imported: 0,
            updated: target.updated,
            skipped: 0,
            accountName: target.accountName,
            latestTrade,
          })
        }
      }

      if (newAccounts.length) {
        publishAccountsUpdated(auth.userId, {
          created: newAccounts,
          primaryAccountId: newAccounts[newAccounts.length - 1]?.id,
        })
      }
      await touchSyncHeartbeat(auth.userId)
      return withSyncCors(
        request,
        NextResponse.json({
          imported: 0,
          updated: closedStale,
          skipped: 0,
          deduped: 0,
          reassigned: 0,
          closedStale,
          accountsCreated: newAccounts.map((account) => account.name),
          newAccounts,
          byAccount: {},
        }),
      )
    }

    let imported = 0
    let updated = 0
    let skipped = 0
    let lastEventId: string | undefined
    const byAccount: Record<string, { name: string; imported: number; updated: number; skipped: number }> = {}
    const touchedAccounts = new Set<string>()
    type TradeSnapshot = {
      id: string
      instrument: string
      trade_type: string
      entry_date: string
      entry_price: number
      signal?: string | null
      is_open?: boolean
    }
    const latestImportedByAccount: Record<string, TradeSnapshot> = {}
    const latestOpenImportedByAccount: Record<string, TradeSnapshot> = {}
    const latestUpdatedByAccount: Record<string, TradeSnapshot> = {}

    const incomingTrades = dropSupersededOpenTradesFromPayload(
      markPaintedOpenTrades(parsed.data.trades),
    )
    skipped += parsed.data.trades.length - incomingTrades.length
    incomingTrades.sort((a, b) => Number(isOpenTvTrade(a)) - Number(isOpenTvTrade(b)))

    const fillEvents: LiveFillEvent[] = []

    for (const tvTrade of incomingTrades) {
      const symbol = chartSymbolOverride || canonicalInstrumentSymbol(tvTrade.instrument)

      if (!priceMatchesInstrument(tvTrade.entry?.price, symbol)) {
        skipped += 1
        continue
      }

      const resolved = await resolveOrCreateAccountForInstrument(
        auth.userId,
        symbol,
        accounts,
      )
      accounts = resolved.accounts
      trackNewAccount(resolved.account, resolved.created)

      const targetAccount = resolved.account
      const accountId = String(targetAccount._id)
      const mapped = mapTradingViewTrade({ ...tvTrade, instrument: symbol }, auth.userId, accountId)
      const existing = await findExistingSyncedTrade(
        auth.userId,
        accountId,
        mapped,
        tvTrade.strategy,
        tvTrade.tradeNumber,
      )

      if (!byAccount[accountId]) {
        byAccount[accountId] = {
          name: targetAccount.name,
          imported: 0,
          updated: 0,
          skipped: 0,
        }
      }

      if (!existing) {
        const created = await Trade.create(mapped)
        imported += 1
        byAccount[accountId].imported += 1
        touchedAccounts.add(accountId)
        const isOpen = !mapped.exit_date
        const snapshot: TradeSnapshot = {
          id: String(created._id),
          instrument: mapped.instrument,
          trade_type: mapped.trade_type,
          entry_date: mapped.entry_date.toISOString(),
          entry_price: mapped.entry_price,
          signal: mapped.signal ?? null,
          is_open: isOpen,
        }
        latestImportedByAccount[accountId] = snapshot
        if (isOpen) {
          latestOpenImportedByAccount[accountId] = snapshot
          fillEvents.push({
            kind: "open",
            reason: "new_open",
            userId: auth.userId,
            accountId,
            accountName: targetAccount.name,
            trade: snapshot,
          })
        } else if (isRecentScalp(mapped.exit_date)) {
          const closedTrade = closeFillTrade(snapshot, mapped)
          fillEvents.push({
            kind: "open",
            reason: "recent_scalp_open",
            userId: auth.userId,
            accountId,
            accountName: targetAccount.name,
            trade: { ...snapshot, is_open: true },
          })
          fillEvents.push({
            kind: "close",
            reason: "recent_scalp_close",
            userId: auth.userId,
            accountId,
            accountName: targetAccount.name,
            trade: closedTrade,
          })
        }
        continue
      }

      if (syncedTradeChanged(existing, mapped)) {
        const wasOpen = !existing.exit_date
        mergeSyncedTrade(existing, mapped, accountId)
        await existing.save()
        updated += 1
        byAccount[accountId].updated += 1
        touchedAccounts.add(accountId)
        const snapshot: TradeSnapshot = {
          id: String(existing._id),
          instrument: mapped.instrument,
          trade_type: mapped.trade_type,
          entry_date: mapped.entry_date.toISOString(),
          entry_price: mapped.entry_price,
          signal: mapped.signal ?? null,
          is_open: !mapped.exit_date,
        }
        latestUpdatedByAccount[accountId] = snapshot
        if (!wasOpen && !mapped.exit_date) {
          imported += 1
          byAccount[accountId].imported += 1
          latestOpenImportedByAccount[accountId] = snapshot
          fillEvents.push({
            kind: "open",
            reason: "reopen",
            userId: auth.userId,
            accountId,
            accountName: targetAccount.name,
            trade: snapshot,
          })
        } else if (wasOpen && mapped.exit_date && isRealLiveClose(mapped)) {
          fillEvents.push({
            kind: "close",
            reason: "live_close",
            userId: auth.userId,
            accountId,
            accountName: targetAccount.name,
            trade: closeFillTrade(snapshot, mapped),
          })
        }
      } else if (existing.accountId !== accountId) {
        existing.accountId = accountId
        await existing.save()
        updated += 1
        byAccount[accountId].updated += 1
        touchedAccounts.add(accountId)
      } else {
        skipped += 1
        byAccount[accountId].skipped += 1
      }
    }

    const deduped = await dedupeSyncedTradesByExternalId(auth.userId)
    const duplicateOpens = await closeDuplicateLiveOpens(auth.userId)
    for (const row of duplicateOpens) {
      const accountId = String(row.accountId)
      touchedAccounts.add(accountId)
      if (!byAccount[accountId]) {
        byAccount[accountId] = { name: "TradingView", imported: 0, updated: 0, skipped: 0 }
      }
      byAccount[accountId].updated += 1
      updated += 1
    }

    let closedStale = 0
    if (parsed.data.reconcileOpens) {
      closedStale = await reconcileStaleOpenTrades(
        auth.userId,
        parsed.data.reconcileOpens.instrument,
        parsed.data.reconcileOpens.opens,
      )
    }
    const healResult = await healIncompleteTvCloses(auth.userId)
    closedStale += healResult.healed
    for (const touch of healResult.touches) {
      touchedAccounts.add(touch.accountId)
    }

    if (closedStale > 0) {
      const refreshTargets = new Map<string, { accountId: string; instrument: string; accountName: string; updated: number }>()
      const symbol = canonicalInstrumentSymbol(
        parsed.data.reconcileOpens?.instrument || chartSymbolOverride || incomingTrades[0]?.instrument || "",
      )
      if (symbol && parsed.data.reconcileOpens) {
        const account = resolveAccountForInstrument(accounts, symbol)
        const accountId = String(account._id)
        refreshTargets.set(accountId, {
          accountId,
          instrument: symbol,
          accountName: account.name,
          updated: closedStale - healResult.healed,
        })
      }
      for (const touch of healResult.touches) {
        const existing = refreshTargets.get(touch.accountId)
        if (existing) {
          existing.updated += touch.updated
          continue
        }
        const account = resolveAccountForInstrument(accounts, touch.instrument)
        refreshTargets.set(touch.accountId, {
          accountId: touch.accountId,
          instrument: touch.instrument,
          accountName: account.name,
          updated: touch.updated,
        })
      }
      for (const target of refreshTargets.values()) {
        if (!byAccount[target.accountId]) {
          byAccount[target.accountId] = {
            name: target.accountName,
            imported: 0,
            updated: 0,
            skipped: 0,
          }
        }
        byAccount[target.accountId].updated += target.updated
        updated += target.updated
      }
    }

    const { moved: reassigned, accountIds: reassignedAccountIds } = await reconcileTradeAccounts(
      auth.userId,
    )
    for (const accountId of reassignedAccountIds) {
      touchedAccounts.add(accountId)
    }

    if (newAccounts.length) {
      publishAccountsUpdated(auth.userId, {
        created: newAccounts,
        primaryAccountId: newAccounts[newAccounts.length - 1]?.id,
      })
    }

    const publishedFillAccounts = new Set<string>()
    for (const fill of fillEvents) {
      const isOpenFill = fill.kind === "open"
      const latestTrade = {
        id: fill.trade.id,
        instrument: fill.trade.instrument,
        trade_type: fill.trade.trade_type,
        entry_date: fill.trade.entry_date,
        entry_price: fill.trade.entry_price,
        signal: fill.trade.signal ?? null,
        is_open: isOpenFill && fill.reason !== "recent_scalp_open",
      }
      const event = await recordTradeSyncEvent(auth.userId, {
        kind: fill.kind,
        accountId: fill.accountId,
        accountName: fill.accountName,
        imported: isOpenFill ? 1 : 0,
        updated: isOpenFill ? 0 : 1,
        skipped: 0,
        latestTrade,
      })
      lastEventId = event.eventId
      publishedFillAccounts.add(fill.accountId)
      publishTradesUpdated(auth.userId, fill.accountId, {
        eventId: event.eventId,
        kind: fill.kind,
        imported: isOpenFill ? 1 : 0,
        updated: isOpenFill ? 0 : 1,
        skipped: 0,
        accountName: fill.accountName,
        latestTrade,
      })
    }

    for (const accountId of touchedAccounts) {
      if (publishedFillAccounts.has(accountId)) continue
      const stats = byAccount[accountId]
      if (!stats || (stats.imported === 0 && stats.updated === 0)) continue
      const latestTrade =
        latestUpdatedByAccount[accountId] ||
        latestImportedByAccount[accountId] ||
        latestOpenImportedByAccount[accountId]
      const event = await recordTradeSyncEvent(auth.userId, {
        kind: latestTrade?.is_open ? "open" : "close",
        accountId,
        accountName: stats.name,
        imported: 0,
        updated: stats.updated,
        skipped: stats.skipped,
        latestTrade: latestTrade ? { ...latestTrade, is_open: false } : undefined,
      })
      lastEventId = event.eventId
      publishTradesUpdated(auth.userId, accountId, {
        eventId: event.eventId,
        kind: "close",
        imported: 0,
        updated: stats.updated,
        skipped: stats.skipped,
        accountName: stats.name,
        latestTrade: latestTrade ? { ...latestTrade, is_open: false } : undefined,
      })
    }

    await flushLiveFillAlerts(fillEvents)

    const byAccountSummary = Object.fromEntries(
      Object.entries(byAccount)
        .filter(([, stats]) => stats.imported > 0 || stats.updated > 0 || stats.skipped > 0)
        .map(([id, stats]) => [
          id,
          {
            name: stats.name,
            imported: stats.imported,
            updated: stats.updated,
            skipped: stats.skipped,
            latestTrade:
              stats.imported > 0
                ? latestOpenImportedByAccount[id] || latestImportedByAccount[id]
                : latestUpdatedByAccount[id] || latestOpenImportedByAccount[id],
          },
        ]),
    )

    await touchSyncHeartbeat(auth.userId)

    return withSyncCors(
      request,
      NextResponse.json({
        imported,
        updated: updated + closedStale,
        skipped,
        deduped,
        reassigned,
        closedStale,
        eventId: lastEventId,
        accountsCreated: newAccounts.map((account) => account.name),
        newAccounts,
        switchToAccountId:
          newAccounts.length > 0
            ? newAccounts[newAccounts.length - 1].id
            : imported > 0 || updated > 0 || closedStale > 0
              ? Object.entries(byAccountSummary).sort(
                  (a, b) => b[1].imported + b[1].updated - (a[1].imported + a[1].updated),
                )[0]?.[0]
              : undefined,
        byAccount: byAccountSummary,
      }),
    )
    })
  } catch (error) {
    console.error("Failed to sync trades:", error)
    return withSyncCors(
      request,
      NextResponse.json({ error: "Unable to sync trades" }, { status: 500 }),
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getSyncAuth(request)
    if (!auth) {
      return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    await connectDB()

    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "5000")
    const limit = Number.isFinite(requestedLimit) ? Math.min(10000, Math.max(1, requestedLimit)) : 5000
    const instrument = request.nextUrl.searchParams.get("instrument")

    const accounts = await getUserAccounts(auth.userId)
    const query: Record<string, unknown> = { userId: auth.userId, source: "tradingview" }

    if (instrument) {
      const targetAccount = resolveAccountForInstrument(accounts, instrument)
      query.accountId = String(targetAccount._id)
    }

    const trades = await Trade.find(query)
      .sort({ entry_date: -1 })
      .limit(limit)
      .lean()

    const formatted = trades.map((trade) => ({
      ...trade,
      id: trade._id.toString(),
      entry_date: trade.entry_date?.toISOString(),
      exit_date: trade.exit_date?.toISOString() || null,
      is_open: isOpenSyncedTrade(trade),
    }))

    const resolvedAccount = instrument
      ? formatAccount(resolveAccountForInstrument(accounts, instrument) as Parameters<typeof formatAccount>[0])
      : undefined

    return withSyncCors(
      request,
      NextResponse.json({
        trades: formatted,
        total: formatted.length,
        account: resolvedAccount,
      }),
    )
  } catch (error) {
    console.error("Failed to load synced trades:", error)
    return withSyncCors(
      request,
      NextResponse.json({ error: "Unable to load synced trades" }, { status: 500 }),
    )
  }
}
