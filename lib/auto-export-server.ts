import "server-only"

import { homedir } from "os"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import User from "@/app/api/models/User"
import {
  LIVE_SYNC_EXPORT_FOLDER,
  normalizeAutoExportPreferences,
  type AutoExportPreferences,
} from "@/lib/auto-export-settings"
import {
  buildSymbolDateFileName,
  buildTradesCsv,
  dayKeyInTimezone,
  dayKeyToYymmdd,
  filterTradesForDay,
  filterTradesForMonth,
  monthKeyInTimezone,
  monthKeyToYymmdd,
  safeExportSymbol,
  type TradeCsvSource,
} from "@/lib/trading/export-trades-csv"

export type DailyExportResult = {
  dayKey: string
  count: number
  relativePath: string
  absolutePath: string
  folderName: string
}

export type MonthlyExportResult = {
  monthKey: string
  count: number
  relativePath: string
  absolutePath: string
  folderName: string
}

/** Saves under the logged-in OS user's home: ~/TradingJournal/{folder}/ */
export function getTradingJournalExportRoot() {
  const fromEnv = process.env.JB_EXPORT_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(homedir(), "TradingJournal")
}

export function describeExportRoot() {
  const root = getTradingJournalExportRoot()
  const home = homedir()
  if (root.startsWith(home + path.sep) || root === home) {
    return `~${root.slice(home.length)}` || "~/TradingJournal"
  }
  return root
}

function toCsvSource(trade: {
  accountId?: string
  instrument: string
  trade_type: string
  strategy?: string | null
  signal?: string | null
  entry_date: Date | string
  entry_price: number
  exit_date?: Date | string | null
  exit_price?: number | null
  quantity: number
  net_pnl?: number | null
  return_pct?: number | null
  commission?: number | null
  external_id?: string | null
}): TradeCsvSource {
  return {
    accountId: trade.accountId,
    instrument: trade.instrument,
    trade_type: trade.trade_type,
    strategy: trade.strategy,
    signal: trade.signal,
    entry_date: trade.entry_date,
    entry_price: trade.entry_price,
    exit_date: trade.exit_date,
    exit_price: trade.exit_price,
    quantity: trade.quantity,
    net_pnl: trade.net_pnl,
    return_pct: trade.return_pct,
    commission: trade.commission,
    external_id: trade.external_id,
  }
}

function dominantSymbol(trades: { instrument?: string }[], fallback = "TRADES") {
  const counts = new Map<string, number>()
  for (const trade of trades) {
    const symbol = safeExportSymbol(trade.instrument || "")
    if (!symbol || symbol === "TRADES") continue
    counts.set(symbol, (counts.get(symbol) || 0) + 1)
  }
  let best = safeExportSymbol(fallback)
  let bestCount = 0
  for (const [symbol, count] of counts) {
    if (count > bestCount) {
      best = symbol
      bestCount = count
    }
  }
  return best
}

export function resolveExportFilePath(folderName: string, dayKey: string, symbol = "TRADES") {
  const safeFolder = normalizeAutoExportPreferences({ folderName }).folderName
  const fileName = buildSymbolDateFileName({
    symbol,
    yymmdd: dayKeyToYymmdd(dayKey),
    scope: "today",
  })
  const dir = path.join(getTradingJournalExportRoot(), safeFolder)
  const absolutePath = path.join(dir, fileName)
  return {
    dir,
    fileName,
    relativePath: path.join("TradingJournal", safeFolder, fileName),
    absolutePath,
    folderName: safeFolder,
  }
}

export function resolveMonthlyExportFilePath(folderName: string, monthKey: string, symbol = "TRADES") {
  const safeFolder = normalizeAutoExportPreferences({ folderName }).folderName
  const fileName = buildSymbolDateFileName({
    symbol,
    yymmdd: monthKeyToYymmdd(monthKey),
    scope: "month",
  })
  const dir = path.join(getTradingJournalExportRoot(), safeFolder)
  const absolutePath = path.join(dir, fileName)
  return {
    dir,
    fileName,
    relativePath: path.join("TradingJournal", safeFolder, fileName),
    absolutePath,
    folderName: safeFolder,
  }
}

export async function runDailyExportForUser(
  userId: string,
  options: {
    dayKey?: string
    folderName?: string
    symbol?: string
    accountId?: string
    source?: "manual" | "scheduled"
  } = {},
): Promise<DailyExportResult> {
  await connectDB()

  const user = await User.findById(userId).select("timezone autoExportPreferences").lean()
  if (!user) throw new Error("User not found")

  const timezone = user.timezone || "Asia/Kolkata"
  const prefs = normalizeAutoExportPreferences(user.autoExportPreferences as Partial<AutoExportPreferences>)
  const dayKey = options.dayKey ?? dayKeyInTimezone(new Date(), timezone)
  const folderName = options.folderName ?? prefs.folderName

  const query: Record<string, unknown> = { userId, source: "tradingview" }
  if (options.accountId) query.accountId = options.accountId

  const trades = await Trade.find(query).sort({ entry_date: -1 }).lean()
  const todayTrades = filterTradesForDay(trades, dayKey, timezone).map(toCsvSource)
  const symbol = safeExportSymbol(options.symbol || dominantSymbol(todayTrades))

  const { dir, relativePath, absolutePath } = resolveExportFilePath(folderName, dayKey, symbol)
  await mkdir(dir, { recursive: true })
  await writeFile(absolutePath, buildTradesCsv(todayTrades), "utf8")

  const nextPrefs: AutoExportPreferences = {
    ...prefs,
    lastExportDayKey: dayKey,
    lastExportAt: new Date().toISOString(),
    lastExportPath: absolutePath,
    lastExportCount: todayTrades.length,
  }

  await User.findByIdAndUpdate(userId, { autoExportPreferences: nextPrefs })

  return {
    dayKey,
    count: todayTrades.length,
    relativePath,
    absolutePath,
    folderName: normalizeAutoExportPreferences({ folderName }).folderName,
  }
}

export async function runMonthlyExportForUser(
  userId: string,
  options: {
    monthKey?: string
    folderName?: string
    symbol?: string
    accountId?: string
  } = {},
): Promise<MonthlyExportResult> {
  await connectDB()

  const user = await User.findById(userId).select("timezone autoExportPreferences").lean()
  if (!user) throw new Error("User not found")

  const timezone = user.timezone || "Asia/Kolkata"
  const prefs = normalizeAutoExportPreferences(user.autoExportPreferences as Partial<AutoExportPreferences>)
  const monthKey = options.monthKey ?? monthKeyInTimezone(new Date(), timezone)
  const folderName = options.folderName ?? prefs.folderName

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Invalid month key (use YYYY-MM)")
  }

  const query: Record<string, unknown> = { userId, source: "tradingview" }
  if (options.accountId) query.accountId = options.accountId

  const trades = await Trade.find(query).sort({ entry_date: -1 }).lean()
  const monthTrades = filterTradesForMonth(trades, monthKey, timezone).map(toCsvSource)
  const symbol = safeExportSymbol(options.symbol || dominantSymbol(monthTrades))

  const { dir, relativePath, absolutePath } = resolveMonthlyExportFilePath(folderName, monthKey, symbol)
  await mkdir(dir, { recursive: true })
  await writeFile(absolutePath, buildTradesCsv(monthTrades), "utf8")

  const nextPrefs: AutoExportPreferences = {
    ...prefs,
    lastMonthlyExportMonthKey: monthKey,
    lastMonthlyExportAt: new Date().toISOString(),
    lastMonthlyExportPath: absolutePath,
    lastMonthlyExportCount: monthTrades.length,
  }

  await User.findByIdAndUpdate(userId, { autoExportPreferences: nextPrefs })

  return {
    monthKey,
    count: monthTrades.length,
    relativePath,
    absolutePath,
    folderName: normalizeAutoExportPreferences({ folderName }).folderName,
  }
}

export type LiveSyncExportResult = {
  scope: "today" | "month" | "all"
  symbol: string
  fileName: string
  count: number
  relativePath: string
  absolutePath: string
  folderName: string
  dayKey?: string
  monthKey?: string
}

/**
 * Live Sync exports → ~/TradingJournal/live-sync/{SYMBOL}_{yymmdd}.csv
 * e.g. BTCUSDT_260806.csv / GOLD_260831.csv / BTCUSDT_260806_all.csv
 */
export async function runLiveSyncFolderExport(
  userId: string,
  options: {
    scope: "today" | "month" | "all"
    symbol: string
    accountId?: string
    folderName?: string
    /** YYYY-MM — required for exporting a specific past/current month */
    monthKey?: string
  },
): Promise<LiveSyncExportResult> {
  await connectDB()

  const user = await User.findById(userId).select("timezone").lean()
  if (!user) throw new Error("User not found")

  const timezone = user.timezone || "Asia/Kolkata"
  const folderName = normalizeAutoExportPreferences({
    folderName: options.folderName ?? LIVE_SYNC_EXPORT_FOLDER,
  }).folderName
  const symbol = safeExportSymbol(options.symbol)
  const now = new Date()
  const dayKey = dayKeyInTimezone(now, timezone)
  const monthKey =
    options.scope === "month" && options.monthKey && /^\d{4}-\d{2}$/.test(options.monthKey)
      ? options.monthKey
      : monthKeyInTimezone(now, timezone)

  const query: Record<string, unknown> = { userId, source: "tradingview" }
  if (options.accountId) query.accountId = options.accountId

  const trades = await Trade.find(query).sort({ entry_date: -1 }).lean()

  let rows: TradeCsvSource[] = []
  let fileName = ""
  let stampDayKey = dayKey

  if (options.scope === "today") {
    rows = filterTradesForDay(trades, dayKey, timezone).map(toCsvSource)
    fileName = buildSymbolDateFileName({
      symbol,
      yymmdd: dayKeyToYymmdd(dayKey),
      scope: "today",
    })
  } else if (options.scope === "month") {
    rows = filterTradesForMonth(trades, monthKey, timezone).map(toCsvSource)
    const yymmdd = monthKeyToYymmdd(monthKey)
    stampDayKey = `${monthKey}-${yymmdd.slice(4)}`
    fileName = buildSymbolDateFileName({
      symbol,
      yymmdd,
      scope: "month",
    })
  } else {
    rows = trades.map(toCsvSource)
    fileName = buildSymbolDateFileName({
      symbol,
      yymmdd: dayKeyToYymmdd(dayKey),
      scope: "all",
    })
  }

  const dir = path.join(getTradingJournalExportRoot(), folderName)
  const absolutePath = path.join(dir, fileName)
  const relativePath = path.join("TradingJournal", folderName, fileName)

  await mkdir(dir, { recursive: true })
  await writeFile(absolutePath, buildTradesCsv(rows), "utf8")

  return {
    scope: options.scope,
    symbol,
    fileName,
    count: rows.length,
    relativePath,
    absolutePath,
    folderName,
    dayKey: options.scope === "month" ? stampDayKey : dayKey,
    monthKey: options.scope === "month" ? monthKey : undefined,
  }
}
