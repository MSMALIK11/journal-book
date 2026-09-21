import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { canonicalInstrumentSymbol, resolveAccountForInstrument } from "@/lib/trading/account-match"
import { mapTradingViewTrade } from "@/lib/trading/tradingview-mapper"
import { dropSupersededOpenTradesFromPayload, resolveSyncedInstrument } from "@/lib/trading/price-sanity"
import { closeDuplicateLiveOpens, enforceOneLiveOpenPerInstrument, healIncompleteTvCloses, healMisclosedSameFillOpens, healNotionalTvPnls, healSignalLevels, healWrongReversalCloses, purgeSupersededOpenTrades, reconcileStaleOpenTrades } from "@/lib/trading/reconcile-open-trades"
import { sameEntryPrice } from "@/lib/trading/sync-dedup"
import { isFlatMtmOpen, isOpenSyncedTrade, isOpenTvTrade, markPaintedOpenTrades, pickTvActiveOpens, type TvActiveOpenHint } from "@/lib/trading/tradingview-open"
import { dedupeSyncedTradesByExternalId, findExistingSyncedTrade, isOpenCoveredByLaterClose, shouldMigrateExternalId } from "@/lib/trading/sync-dedup"
import { formatAccount, getUserAccounts, reconcileTradeAccounts, resolveOrCreateAccountForInstrument } from "@/lib/trading-accounts-server"
import { publishAccountsUpdated, publishTradesUpdated } from "@/lib/sync-events"
import { recordTradeSyncEvent } from "@/lib/sync-last-event"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"
import { touchSyncHeartbeat } from "@/lib/sync-heartbeat"
import {
  flushLiveFillAlerts,
  isFreshFillEvent,
  isRealLiveClose,
  isRecentScalp,
  type LiveFillEvent,
  type LiveFillTrade,
} from "@/lib/trading/live-fill-alerts"
import { withUserSyncLock } from "@/lib/trading/sync-lock"
import { tradingViewSyncSchema } from "@/lib/validations/tradingview-sync"
import { decodeScreenshotJpeg } from "@/lib/telegram/screenshot"
import {
  runDeltaAutoTradeForFills,
  runDeltaBracketUpdatesForOpenTrades,
  type DeltaBracketLevelUpdate,
} from "@/lib/broker/delta-auto-trade"

function mergeActiveOpenHints(
  scraped: TvActiveOpenHint[],
  payload?: { opens?: TvActiveOpenHint[] } | null,
): TvActiveOpenHint[] {
  const all = [...scraped, ...(payload?.opens || [])]
  if (!all.length) return []
  const live = all.reduce((best, hint) => {
    const num = Number(hint.tradeNumber) || 0
    const bestNum = Number(best.tradeNumber) || 0
    return num > bestNum ? hint : best
  }, all[0])
  return [live]
}

function hasNewerTvOpen(
  incomingTrades: { tradeNumber?: number; entry?: { datetime?: string }; exit?: { datetime?: string; signal?: string } | null; netPnl?: number; returnPct?: number }[],
  tvTrade: { tradeNumber?: number },
) {
  const num = Number(tvTrade.tradeNumber) || 0
  return incomingTrades.some(
    (row) => isOpenTvTrade(row) && (Number(row.tradeNumber) || 0) > num,
  )
}

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

  if (typeof mapped.quantity === "number") existing.quantity = mapped.quantity
  if (typeof mapped.net_pnl === "number") existing.net_pnl = mapped.net_pnl
  if (typeof mapped.return_pct === "number") existing.return_pct = mapped.return_pct
  if (typeof mapped.commission === "number") existing.commission = mapped.commission
  persistExtractedLevels(existing, mapped)
  if (mapped.tags?.length) existing.tags = mapped.tags
}

function persistExtractedLevels(
  existing: InstanceType<typeof Trade>,
  mapped: ReturnType<typeof mapTradingViewTrade>,
) {
  let changed = false
  if (typeof mapped.stop_loss === "number" && existing.stop_loss !== mapped.stop_loss) {
    existing.stop_loss = mapped.stop_loss
    changed = true
  }
  if (typeof mapped.target === "number" && existing.target !== mapped.target) {
    existing.target = mapped.target
    changed = true
  }
  if (mapped.signal && existing.signal !== mapped.signal) {
    existing.signal = mapped.signal
    changed = true
  }
  return changed
}

function syncedTradeChanged(
  existing: InstanceType<typeof Trade>,
  mapped: ReturnType<typeof mapTradingViewTrade>,
): boolean {
  // Live TV Open paints MTM time/price every poll — that is not a new fill.
  // Still persist SL/TP when they first appear so Delta can use them later.
  const stillOpen = !mapped.exit_date && !existing.exit_date
  if (stillOpen) {
    if (typeof mapped.stop_loss === "number" && existing.stop_loss !== mapped.stop_loss) return true
    if (typeof mapped.target === "number" && existing.target !== mapped.target) return true
    if (typeof mapped.quantity === "number" && existing.quantity !== mapped.quantity) return true
    return false
  }

  if (shouldMigrateExternalId(existing, mapped)) return true
  if (existing.entry_date?.getTime() !== mapped.entry_date.getTime()) return true
  if (Boolean(mapped.exit_date) !== Boolean(existing.exit_date)) return true
  if (mapped.exit_date && existing.exit_date?.getTime() !== mapped.exit_date.getTime()) return true
  if (mapped.exit_date && !existing.exit_date) return true
  if (!mapped.exit_date && existing.exit_date) return true
  if (mapped.exit_price != null && existing.exit_price !== mapped.exit_price) return true
  if (!mapped.exit_date && existing.exit_price != null) return true

  if (typeof mapped.quantity === "number" && existing.quantity !== mapped.quantity) return true
  if (typeof mapped.net_pnl === "number" && existing.net_pnl !== mapped.net_pnl) return true
  if (typeof mapped.return_pct === "number" && existing.return_pct !== mapped.return_pct) return true
  if (typeof mapped.commission === "number" && existing.commission !== mapped.commission) return true
  if (typeof mapped.stop_loss === "number" && existing.stop_loss !== mapped.stop_loss) return true
  if (typeof mapped.target === "number" && existing.target !== mapped.target) return true
  if (mapped.signal && existing.signal !== mapped.signal) return true
  return false
}

type TradeSnapshot = {
  id: string
  instrument: string
  trade_type: string
  entry_date: string
  entry_price: number
  signal?: string | null
  stop_loss?: number
  target?: number
  is_open?: boolean
}

function tradeSnapshotFromMapped(
  id: string,
  mapped: ReturnType<typeof mapTradingViewTrade>,
  isOpen: boolean,
): TradeSnapshot {
  return {
    id,
    instrument: mapped.instrument,
    trade_type: mapped.trade_type,
    entry_date: mapped.entry_date.toISOString(),
    entry_price: mapped.entry_price,
    signal: mapped.signal ?? null,
    stop_loss: typeof mapped.stop_loss === "number" ? mapped.stop_loss : undefined,
    target: typeof mapped.target === "number" ? mapped.target : undefined,
    is_open: isOpen,
  }
}

function pushBracketLevelUpdate(
  bucket: DeltaBracketLevelUpdate[],
  existing: InstanceType<typeof Trade>,
  mapped: ReturnType<typeof mapTradingViewTrade>,
) {
  bucket.push({
    tradeId: String(existing._id),
    instrument: mapped.instrument,
    trade_type: mapped.trade_type,
    entry_price: mapped.entry_price,
    stop_loss:
      typeof existing.stop_loss === "number"
        ? existing.stop_loss
        : typeof mapped.stop_loss === "number"
          ? mapped.stop_loss
          : undefined,
    target:
      typeof existing.target === "number"
        ? existing.target
        : typeof mapped.target === "number"
          ? mapped.target
          : undefined,
  })
}

function closeFillTrade(
  snapshot: TradeSnapshot,
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

/** Fire Telegram/push/Delta as soon as fills are known — don't wait for DB heal passes. */
async function dispatchFillSideEffects(
  userId: string,
  fillEvents: LiveFillEvent[],
  bracketLevelUpdates: DeltaBracketLevelUpdate[],
  chartPhoto: Buffer | null,
): Promise<string | undefined> {
  if (fillEvents.length === 0 && bracketLevelUpdates.length === 0) return undefined

  let lastEventId: string | undefined
  const freshFills = fillEvents.filter((fill) => isFreshFillEvent(fill))
  for (const fill of fillEvents) {
    const isOpenFill = fill.kind === "open"
    const fresh = isFreshFillEvent(fill)
    const latestTrade = {
      id: fill.trade.id,
      instrument: fill.trade.instrument,
      trade_type: fill.trade.trade_type,
      entry_date: fill.trade.entry_date,
      entry_price: fill.trade.entry_price,
      signal: fill.trade.signal ?? null,
      is_open: isOpenFill && fill.reason !== "recent_scalp_open",
    }
    const imported = isOpenFill && fresh ? 1 : 0
    const updated = isOpenFill ? (fresh ? 0 : 1) : 1
    const event = await recordTradeSyncEvent(userId, {
      kind: fill.kind,
      accountId: fill.accountId,
      accountName: fill.accountName,
      imported,
      updated,
      skipped: 0,
      latestTrade,
    })
    lastEventId = event.eventId
    publishTradesUpdated(userId, fill.accountId, {
      eventId: event.eventId,
      kind: fill.kind,
      imported,
      updated,
      skipped: 0,
      accountName: fill.accountName,
      latestTrade,
    })
  }

  if (freshFills.length > 0) {
    await flushLiveFillAlerts(freshFills, chartPhoto)
    void runDeltaAutoTradeForFills(userId, freshFills).catch((error) => {
      console.error("Delta auto-trade failed:", error)
    })
  }

  const openFillTradeIds = new Set(
    freshFills.filter((fill) => fill.kind === "open").map((fill) => fill.trade.id),
  )
  const lateBracketUpdates = bracketLevelUpdates.filter((update) => !openFillTradeIds.has(update.tradeId))
  if (lateBracketUpdates.length > 0) {
    void runDeltaBracketUpdatesForOpenTrades(userId, lateBracketUpdates).catch((error) => {
      console.error("Delta bracket update failed:", error)
    })
  }

  return lastEventId
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

    const chartPhoto = decodeScreenshotJpeg(parsed.data.screenshotJpeg)

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
      await healMisclosedSameFillOpens(auth.userId)
      await closeDuplicateLiveOpens(auth.userId)
      const reversedOpens = await enforceOneLiveOpenPerInstrument(auth.userId)
      let closedStale = reversedOpens.length + (await healWrongReversalCloses(auth.userId))
      if (parsed.data.reconcileOpens) {
        closedStale += await reconcileStaleOpenTrades(
          auth.userId,
          parsed.data.reconcileOpens.instrument,
          parsed.data.reconcileOpens.opens,
        )
      }
      const purged = await purgeSupersededOpenTrades(auth.userId)
      closedStale += purged.deleted
      await healNotionalTvPnls(auth.userId)
      await healSignalLevels(auth.userId)
      const healResult = await healIncompleteTvCloses(auth.userId)
      closedStale += healResult.healed
      healResult.touches.push(
        ...purged.touches.map((touch) => ({ ...touch, updated: 1 })),
      )

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
    const byAccount: Record<string, { name: string; imported: number; updated: number; skipped: number }> = {}
    const touchedAccounts = new Set<string>()
    const latestImportedByAccount: Record<string, TradeSnapshot> = {}
    const latestOpenImportedByAccount: Record<string, TradeSnapshot> = {}
    const latestUpdatedByAccount: Record<string, TradeSnapshot> = {}

    const incomingTrades = dropSupersededOpenTradesFromPayload(
      markPaintedOpenTrades(parsed.data.trades),
    )
    skipped += parsed.data.trades.length - incomingTrades.length
    incomingTrades.sort((a, b) => Number(isOpenTvTrade(a)) - Number(isOpenTvTrade(b)))

    const fillEvents: LiveFillEvent[] = []
    const bracketLevelUpdates: DeltaBracketLevelUpdate[] = []

    for (const tvTrade of incomingTrades) {
      const symbol = resolveSyncedInstrument(
        tvTrade.entry?.price,
        chartSymbolOverride,
        canonicalInstrumentSymbol(tvTrade.instrument),
      )

      if (!symbol) {
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
        if (!mapped.exit_date && (await isOpenCoveredByLaterClose(auth.userId, mapped))) {
          skipped += 1
          byAccount[accountId].skipped += 1
          continue
        }
        const created = await Trade.create(mapped)
        imported += 1
        byAccount[accountId].imported += 1
        touchedAccounts.add(accountId)
        const isOpen = !mapped.exit_date
        const snapshot = tradeSnapshotFromMapped(String(created._id), mapped, isOpen)
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

      const tvStillOpen = isOpenTvTrade(tvTrade)
      const dbStillOpen = !existing.exit_date

      // TV List of Trades exit wins over a synthetic reversal stamp from reconcile.
      if (
        !tvStillOpen &&
        mapped.exit_date &&
        mapped.exit_price != null &&
        existing.exit_date &&
        (Math.abs(mapped.exit_date.getTime() - existing.exit_date.getTime()) > 60_000 ||
          !sameEntryPrice(mapped.exit_price, existing.exit_price) ||
          (typeof mapped.net_pnl === "number" &&
            typeof existing.net_pnl === "number" &&
            Math.abs(mapped.net_pnl - existing.net_pnl) >= 0.02))
      ) {
        mergeSyncedTrade(existing, mapped, accountId)
        await existing.save()
        updated += 1
        byAccount[accountId].updated += 1
        touchedAccounts.add(accountId)
        continue
      }

      // Recover a prior glitchy poll that synthetic-closed a still-live TV row.
      if (
        tvStillOpen &&
        existing.exit_date &&
        sameEntryPrice(existing.entry_price, mapped.entry_price) &&
        !hasNewerTvOpen(incomingTrades, tvTrade)
      ) {
        existing.set("exit_date", null)
        existing.set("exit_price", null)
        existing.set("net_pnl", null)
        existing.set("return_pct", null)
        persistExtractedLevels(existing, mapped)
        await existing.save()
        updated += 1
        byAccount[accountId].updated += 1
        touchedAccounts.add(accountId)
        continue
      }

      // TV still says Open — never accept a close from a glitchy scrape.
      if (tvStillOpen && dbStillOpen) {
        if (persistExtractedLevels(existing, mapped)) {
          await existing.save()
          updated += 1
          byAccount[accountId].updated += 1
          touchedAccounts.add(accountId)
          pushBracketLevelUpdate(bracketLevelUpdates, existing, mapped)
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
        continue
      }

      const stillOpen = !mapped.exit_date && dbStillOpen
      if (stillOpen) {
        if (persistExtractedLevels(existing, mapped)) {
          await existing.save()
          updated += 1
          byAccount[accountId].updated += 1
          touchedAccounts.add(accountId)
          pushBracketLevelUpdate(bracketLevelUpdates, existing, mapped)
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
        continue
      }

      if (syncedTradeChanged(existing, mapped)) {
        const wasOpen = dbStillOpen
        const flatMtmGhost =
          isFlatMtmOpen({
            entry: tvTrade.entry,
            exit: tvTrade.exit,
            netPnl: tvTrade.netPnl,
            returnPct: tvTrade.returnPct,
          }) ||
          (mapped.exit_price != null &&
            sameEntryPrice(mapped.entry_price, mapped.exit_price) &&
            (mapped.net_pnl == null || Math.abs(mapped.net_pnl) <= 0.01))

        if (wasOpen && mapped.exit_date && (tvStillOpen || flatMtmGhost)) {
          if (persistExtractedLevels(existing, mapped)) {
            await existing.save()
            updated += 1
            byAccount[accountId].updated += 1
            touchedAccounts.add(accountId)
            pushBracketLevelUpdate(bracketLevelUpdates, existing, mapped)
          } else {
            skipped += 1
            byAccount[accountId].skipped += 1
          }
          continue
        }
        mergeSyncedTrade(existing, mapped, accountId)
        await existing.save()
        updated += 1
        byAccount[accountId].updated += 1
        touchedAccounts.add(accountId)
        const snapshot = tradeSnapshotFromMapped(String(existing._id), mapped, !mapped.exit_date)
        latestUpdatedByAccount[accountId] = snapshot
        if (!wasOpen && !mapped.exit_date) {
          const repaint = sameEntryPrice(existing.entry_price, mapped.entry_price)
          if (repaint) {
            existing.set("exit_date", null)
            existing.set("exit_price", null)
            existing.set("net_pnl", null)
            existing.set("return_pct", null)
            await existing.save()
          } else {
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
          }
        } else if (wasOpen && mapped.exit_date && isRealLiveClose(mapped, tvTrade)) {
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

    let lastEventId = await dispatchFillSideEffects(
      auth.userId,
      fillEvents,
      bracketLevelUpdates,
      chartPhoto,
    )

    const deduped = await dedupeSyncedTradesByExternalId(auth.userId)
    await healMisclosedSameFillOpens(auth.userId)
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

    const reversedOpens = await enforceOneLiveOpenPerInstrument(auth.userId)
    for (const row of reversedOpens) {
      const accountId = String(row.accountId)
      touchedAccounts.add(accountId)
      if (!byAccount[accountId]) {
        byAccount[accountId] = { name: "TradingView", imported: 0, updated: 0, skipped: 0 }
      }
      byAccount[accountId].updated += 1
      updated += 1
    }

    const healedReversals = await healWrongReversalCloses(auth.userId)
    if (healedReversals) updated += healedReversals

    let closedStale = reversedOpens.length + healedReversals
    const reconcileInstrument =
      chartSymbolOverride ||
      parsed.data.reconcileOpens?.instrument ||
      canonicalInstrumentSymbol(incomingTrades[0]?.instrument || "")
    const scrapedOpens = reconcileInstrument
      ? pickTvActiveOpens(
          incomingTrades.filter(
            (row) =>
              canonicalInstrumentSymbol(row.instrument || "") === reconcileInstrument ||
              row.instrument === reconcileInstrument,
          ),
        )
      : []
    const activeOpens = mergeActiveOpenHints(scrapedOpens, parsed.data.reconcileOpens)
    if (reconcileInstrument && activeOpens.length) {
      closedStale += await reconcileStaleOpenTrades(auth.userId, reconcileInstrument, activeOpens)
    }
    const purged = await purgeSupersededOpenTrades(auth.userId)
    closedStale += purged.deleted
    updated += purged.deleted
    for (const touch of purged.touches) {
      touchedAccounts.add(touch.accountId)
      if (!byAccount[touch.accountId]) {
        byAccount[touch.accountId] = { name: "TradingView", imported: 0, updated: 0, skipped: 0 }
      }
      byAccount[touch.accountId].updated += 1
    }
    await healNotionalTvPnls(auth.userId)
    await healSignalLevels(auth.userId)
    const healResult = await healIncompleteTvCloses(auth.userId)
    closedStale += healResult.healed
    healResult.touches.push(...purged.touches.map((touch) => ({ ...touch, updated: 1 })))
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

    // Only the extension's `fetchKnownTradeSnapshot` reads this, and it needs just enough to build
    // its id/fingerprint sets: external_id, instrument, entry_date, trade_type, plus exit_date for
    // the is_open flag. Returning whole documents made a 1500-row poll needlessly heavy.
    const trades = await Trade.find(query)
      .select("_id accountId external_id instrument trade_type entry_date exit_date")
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
