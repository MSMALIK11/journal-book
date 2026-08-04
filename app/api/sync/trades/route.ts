import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { resolveAccountForInstrument } from "@/lib/trading/account-match"
import { mapTradingViewTrade } from "@/lib/trading/tradingview-mapper"
import { dedupeSyncedTradesByExternalId, findExistingSyncedTrade, shouldMigrateExternalId } from "@/lib/trading/sync-dedup"
import { formatAccount, getUserAccounts } from "@/lib/trading-accounts-server"
import { publishTradesUpdated } from "@/lib/sync-events"
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

  if (mapped.exit_date) existing.exit_date = mapped.exit_date
  if (mapped.exit_price != null) existing.exit_price = mapped.exit_price
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
  if (mapped.exit_date && existing.exit_date?.getTime() !== mapped.exit_date.getTime()) return true
  if (mapped.exit_date && !existing.exit_date) return true
  if (mapped.exit_price != null && existing.exit_price !== mapped.exit_price) return true
  if (typeof mapped.net_pnl === "number" && existing.net_pnl !== mapped.net_pnl) return true
  if (typeof mapped.return_pct === "number" && existing.return_pct !== mapped.return_pct) return true
  if (typeof mapped.commission === "number" && existing.commission !== mapped.commission) return true
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

    const accounts = await getUserAccounts(auth.userId)

    let imported = 0
    let updated = 0
    let skipped = 0
    const byAccount: Record<string, { name: string; imported: number; updated: number; skipped: number }> = {}
    const touchedAccounts = new Set<string>()

    for (const tvTrade of parsed.data.trades) {
      const targetAccount = resolveAccountForInstrument(accounts, tvTrade.instrument)
      const accountId = String(targetAccount._id)
      const mapped = mapTradingViewTrade(tvTrade, auth.userId, accountId)
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
        await Trade.create(mapped)
        imported += 1
        byAccount[accountId].imported += 1
        touchedAccounts.add(accountId)
        continue
      }

      if (syncedTradeChanged(existing, mapped)) {
        mergeSyncedTrade(existing, mapped, accountId)
        await existing.save()
        updated += 1
        byAccount[accountId].updated += 1
        touchedAccounts.add(accountId)
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

    for (const accountId of touchedAccounts) {
      const stats = byAccount[accountId]
      if (stats.imported > 0 || stats.updated > 0) {
        publishTradesUpdated(auth.userId, accountId, {
          imported: stats.imported,
          updated: stats.updated,
          skipped: stats.skipped,
        })
      }
    }

    const byAccountSummary = Object.fromEntries(
      Object.entries(byAccount)
        .filter(([, stats]) => stats.imported > 0 || stats.updated > 0 || stats.skipped > 0)
        .map(([id, stats]) => [id, { name: stats.name, ...stats }]),
    )

    await touchSyncHeartbeat(auth.userId)

    return withSyncCors(
      request,
      NextResponse.json({ imported, updated, skipped, deduped, byAccount: byAccountSummary }),
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
