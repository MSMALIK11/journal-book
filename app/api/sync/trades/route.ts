import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { canonicalInstrumentSymbol, resolveAccountForInstrument } from "@/lib/trading/account-match"
import { mapTradingViewTrade } from "@/lib/trading/tradingview-mapper"
import { dropSupersededOpenTradesFromPayload, priceMatchesInstrument } from "@/lib/trading/price-sanity"
import {
  purgeSupersededOpenTrades,
  reconcileStaleOpenTrades,
} from "@/lib/trading/reconcile-open-trades"
import { isOpenSyncedTrade, isOpenTvSignal, isOpenTvTrade } from "@/lib/trading/tradingview-open"
import { dedupeSyncedTradesByExternalId, findExistingSyncedTrade, shouldMigrateExternalId } from "@/lib/trading/sync-dedup"
import { formatAccount, getUserAccounts, reconcileTradeAccounts, resolveOrCreateAccountForInstrument } from "@/lib/trading-accounts-server"
import { publishAccountsUpdated, publishTradesUpdated } from "@/lib/sync-events"
import { recordTradeSyncEvent } from "@/lib/sync-last-event"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"
import { touchSyncHeartbeat } from "@/lib/sync-heartbeat"
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
      closedStale += await purgeSupersededOpenTrades(
        auth.userId,
        parsed.data.reconcileOpens?.instrument || chartSymbolOverride || undefined,
      )
      if (closedStale > 0) {
        const symbol = canonicalInstrumentSymbol(
          parsed.data.reconcileOpens?.instrument || chartSymbolOverride || "",
        )
        if (symbol) {
          const account = resolveAccountForInstrument(accounts, symbol)
          const accountId = String(account._id)
          const event = await recordTradeSyncEvent(auth.userId, {
            accountId,
            accountName: account.name,
            imported: 0,
            updated: closedStale,
            skipped: 0,
          })
          publishTradesUpdated(auth.userId, accountId, {
            eventId: event.eventId,
            imported: 0,
            updated: closedStale,
            skipped: 0,
            accountName: account.name,
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

    const incomingTrades = dropSupersededOpenTradesFromPayload(parsed.data.trades)
    skipped += parsed.data.trades.length - incomingTrades.length

    // Latest closed entry per instrument already in DB — blocks resurrected ghost opens.
    const closedCeiling = new Map<string, number>()
    {
      const existingRows = await Trade.find({
        userId: auth.userId,
        source: "tradingview",
      })
        .select("instrument entry_date exit_date signal tags")
        .lean()
      for (const row of existingRows) {
        if (isOpenSyncedTrade(row)) continue
        const key = canonicalInstrumentSymbol(String(row.instrument || ""))
        const ms = row.entry_date ? new Date(row.entry_date).getTime() : NaN
        if (!key || !Number.isFinite(ms)) continue
        const prev = closedCeiling.get(key) ?? -Infinity
        if (ms > prev) closedCeiling.set(key, ms)
      }
      for (const trade of incomingTrades) {
        if (isOpenTvTrade(trade)) continue
        const key = canonicalInstrumentSymbol(trade.instrument)
        let ms = NaN
        try {
          ms = new Date(trade.entry.datetime).getTime()
        } catch {
          ms = NaN
        }
        if (!key || !Number.isFinite(ms)) continue
        const prev = closedCeiling.get(key) ?? -Infinity
        if (ms > prev) closedCeiling.set(key, ms)
      }
    }

    for (const tvTrade of incomingTrades) {
      const symbol = chartSymbolOverride || canonicalInstrumentSymbol(tvTrade.instrument)

      if (!priceMatchesInstrument(tvTrade.entry?.price, symbol)) {
        skipped += 1
        continue
      }

      if (isOpenTvTrade(tvTrade)) {
        const ceiling = closedCeiling.get(symbol) ?? closedCeiling.get(canonicalInstrumentSymbol(symbol))
        const entryMs = new Date(tvTrade.entry.datetime).getTime()
        if (ceiling != null && Number.isFinite(entryMs) && entryMs < ceiling) {
          skipped += 1
          continue
        }
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
        const isOpen = isOpenSyncedTrade(mapped) || isOpenTvSignal(mapped.signal)
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
        }
        continue
      }

      if (syncedTradeChanged(existing, mapped)) {
        mergeSyncedTrade(existing, mapped, accountId)
        await existing.save()
        updated += 1
        byAccount[accountId].updated += 1
        touchedAccounts.add(accountId)
        latestUpdatedByAccount[accountId] = {
          id: String(existing._id),
          instrument: mapped.instrument,
          trade_type: mapped.trade_type,
          entry_date: mapped.entry_date.toISOString(),
          entry_price: mapped.entry_price,
          signal: mapped.signal ?? null,
          is_open: isOpenSyncedTrade(mapped) || isOpenTvSignal(mapped.signal),
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

    let closedStale = 0
    if (parsed.data.reconcileOpens) {
      closedStale = await reconcileStaleOpenTrades(
        auth.userId,
        parsed.data.reconcileOpens.instrument,
        parsed.data.reconcileOpens.opens,
      )
    }

    const purged = await purgeSupersededOpenTrades(
      auth.userId,
      parsed.data.reconcileOpens?.instrument || chartSymbolOverride || undefined,
    )
    closedStale += purged

    if (closedStale > 0) {
      const symbol = canonicalInstrumentSymbol(
        parsed.data.reconcileOpens?.instrument || chartSymbolOverride || incomingTrades[0]?.instrument || "",
      )
      if (symbol) {
        const account = resolveAccountForInstrument(accounts, symbol)
        touchedAccounts.add(String(account._id))
        const accountId = String(account._id)
        if (!byAccount[accountId]) {
          byAccount[accountId] = {
            name: account.name,
            imported: 0,
            updated: 0,
            skipped: 0,
          }
        }
        byAccount[accountId].updated += closedStale
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

    for (const accountId of touchedAccounts) {
      const stats = byAccount[accountId]
      if (stats.imported > 0 || stats.updated > 0) {
        const latestTrade =
          stats.imported > 0
            ? latestOpenImportedByAccount[accountId] || latestImportedByAccount[accountId]
            : latestUpdatedByAccount[accountId]

        const event = await recordTradeSyncEvent(auth.userId, {
          accountId,
          accountName: stats.name,
          imported: stats.imported,
          updated: stats.updated,
          skipped: stats.skipped,
          // Opens for alarm; updates/closes still carry a snapshot so UI can refresh.
          latestTrade,
        })

        publishTradesUpdated(auth.userId, accountId, {
          eventId: event.eventId,
          imported: stats.imported,
          updated: stats.updated,
          skipped: stats.skipped,
          accountName: stats.name,
          latestTrade,
        })
      }
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
