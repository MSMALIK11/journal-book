import "server-only"

import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import User from "@/app/api/models/User"
import { resolveClosedTradeMetrics } from "@/lib/trading/close-pnl"
import { isOpenSyncedTrade } from "@/lib/trading/tradingview-open"
import { formatTradeStartTime, tradeSideLabel } from "@/lib/trading/trade-display"
import { dayKeyInTimezone, timeInTimezone } from "@/lib/trading/export-trades-csv"
import { getUserAccounts } from "@/lib/trading-accounts-server"
import {
  normalizeTelegramPreferences,
  type TelegramPreferences,
} from "@/lib/telegram/settings"
import {
  formatTelegramPnl,
  invalidateTelegramPrefsCache,
  resolveTelegramChatId,
  sendTelegramMessage,
} from "@/lib/telegram/send-trade-alert"

const TELEGRAM_TEXT_MAX = 4096
const LOOKBACK_MS = 48 * 60 * 60 * 1000
const sending = new Set<string>()

type SummaryTrade = {
  accountId: string
  instrument: string
  trade_type: "Buy" | "Sell"
  entry_date: Date
  exit_date?: Date | null
  entry_price: number
  exit_price?: number | null
  quantity?: number
  contract_size?: number
  net_pnl?: number | null
  return_pct?: number | null
  source?: string
  signal?: string | null
}

export type DailyTelegramSummaryResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  dayKey?: string
  closedCount?: number
  openCount?: number
  totalPnl?: number
  message?: string
}

function minutesOf(clock: string) {
  const [hour, minute] = clock.split(":").map(Number)
  const safeHour = hour === 24 ? 0 : hour
  return (Number.isFinite(safeHour) ? safeHour : 0) * 60 + (Number.isFinite(minute) ? minute : 0)
}

export function isPastSummaryTime(current: string, target: string) {
  return minutesOf(current) >= minutesOf(target)
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function asIso(value: Date | string | null | undefined) {
  const date = asDate(value)
  return date ? date.toISOString() : ""
}

function isClosedTrade(trade: SummaryTrade) {
  if (isOpenSyncedTrade(trade)) return false
  return Number.isFinite(Number(trade.exit_price))
}

function closedPnl(trade: SummaryTrade) {
  if (!isClosedTrade(trade)) return 0
  const stored = Number(trade.net_pnl)
  const metrics = resolveClosedTradeMetrics({
    trade_type: trade.trade_type,
    entry_price: Number(trade.entry_price),
    exit_price: Number(trade.exit_price),
    quantity: trade.quantity,
    contract_size: trade.contract_size,
    instrument: trade.instrument,
    net_pnl: Number.isFinite(stored) ? stored : null,
    return_pct: trade.return_pct,
  })
  return metrics.net_pnl
}

function formatDayLabel(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatPrice(price: number) {
  if (!Number.isFinite(price)) return "—"
  return price.toLocaleString("en-US", { maximumFractionDigits: 5 })
}

function clipTelegramText(text: string) {
  if (text.length <= TELEGRAM_TEXT_MAX) return text
  return `${text.slice(0, TELEGRAM_TEXT_MAX - 14)}\n…truncated`
}

export function buildDailyTelegramSummaryMessage(options: {
  dayKey: string
  timezone: string
  asOf?: string
  closed: SummaryTrade[]
  open: SummaryTrade[]
  accountNames: Map<string, string>
}) {
  const { dayKey, timezone, asOf, closed, open, accountNames } = options
  const totalPnl = closed.reduce((sum, trade) => sum + closedPnl(trade), 0)
  const wins = closed.filter((trade) => closedPnl(trade) > 0).length
  const losses = closed.filter((trade) => closedPnl(trade) < 0).length
  const lines = [
    asOf
      ? `Daily summary · ${formatDayLabel(dayKey)} · till ${asOf}`
      : `Daily summary · ${formatDayLabel(dayKey)}`,
  ]

  if (closed.length === 0 && open.length === 0) {
    lines.push("No trades today.")
    lines.push(`Total  ${formatTelegramPnl(0)}`)
    return { text: lines.join("\n"), totalPnl: 0 }
  }

  lines.push(
    `Closed ${closed.length}  ·  W ${wins}  L ${losses}`,
    `Total  ${formatTelegramPnl(totalPnl)}`,
  )

  const byAccount = new Map<string, SummaryTrade[]>()
  for (const trade of closed) {
    const key = trade.accountId || "default"
    const list = byAccount.get(key) || []
    list.push(trade)
    byAccount.set(key, list)
  }

  const showAccount = byAccount.size > 1
  for (const [accountId, trades] of byAccount) {
    const accountName = accountNames.get(accountId)
    const sorted = [...trades].sort((a, b) => {
      const aTime = asDate(a.entry_date)?.getTime() || 0
      const bTime = asDate(b.entry_date)?.getTime() || 0
      return aTime - bTime
    })
    const accountPnl = sorted.reduce((sum, trade) => sum + closedPnl(trade), 0)
    lines.push("")
    if (showAccount) {
      lines.push(`${accountName || "Account"}  ${formatTelegramPnl(accountPnl)}`)
    }

    sorted.forEach((trade, index) => {
      const side = tradeSideLabel(trade.trade_type)
      const start = formatTradeStartTime(asIso(trade.entry_date), timezone) || "—"
      const end = formatTradeStartTime(asIso(trade.exit_date), timezone) || "—"
      lines.push(
        `${index + 1}. ${side} ${trade.instrument}  ${start}–${end}  ${formatTelegramPnl(closedPnl(trade))}`,
      )
    })
  }

  if (open.length > 0) {
    lines.push("")
    lines.push(`Open ${open.length}`)
    const sortedOpen = [...open].sort((a, b) => {
      const aTime = asDate(a.entry_date)?.getTime() || 0
      const bTime = asDate(b.entry_date)?.getTime() || 0
      return aTime - bTime
    })
    for (const trade of sortedOpen) {
      const side = tradeSideLabel(trade.trade_type)
      const start = formatTradeStartTime(asIso(trade.entry_date), timezone) || "—"
      const account = showAccount ? ` · ${accountNames.get(trade.accountId) || "Account"}` : ""
      lines.push(`• ${side} ${trade.instrument}  ${start} @ ${formatPrice(Number(trade.entry_price))}${account}`)
    }
  }

  return { text: clipTelegramText(lines.join("\n")), totalPnl }
}

async function loadTodayTrades(userId: string, timezone: string, dayKey: string) {
  await connectDB()
  const since = new Date(Date.now() - LOOKBACK_MS)
  const rows = (await Trade.find({
    userId,
    entry_date: { $gte: since },
  })
    .select(
      "accountId instrument trade_type entry_date exit_date entry_price exit_price quantity contract_size net_pnl return_pct source signal",
    )
    .lean()) as SummaryTrade[]

  const todays = rows.filter((trade) => {
    const entry = asDate(trade.entry_date)
    return entry ? dayKeyInTimezone(entry, timezone) === dayKey : false
  })

  const closed = todays.filter((trade) => isClosedTrade(trade))
  const open = todays.filter((trade) => !isClosedTrade(trade))

  return { closed, open }
}

async function loadPrefsAndTimezone(userId: string) {
  await connectDB()
  const user = await User.findById(userId).select("timezone telegramPreferences").lean()
  return {
    timezone: user?.timezone || "Asia/Kolkata",
    prefs: normalizeTelegramPreferences(
      user?.telegramPreferences as Partial<TelegramPreferences> | undefined,
    ),
  }
}

async function claimDailySummaryDay(userId: string, dayKey: string) {
  await connectDB()
  const claimed = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { "telegramPreferences.lastDailySummaryDayKey": { $exists: false } },
        { "telegramPreferences.lastDailySummaryDayKey": null },
        { "telegramPreferences.lastDailySummaryDayKey": { $ne: dayKey } },
      ],
    },
    { $set: { "telegramPreferences.lastDailySummaryDayKey": dayKey } },
    { new: false },
  )
  invalidateTelegramPrefsCache(userId)
  return Boolean(claimed)
}

async function restoreDailySummaryDay(userId: string, dayKey: string, previous?: string) {
  await connectDB()
  if (previous) {
    await User.updateOne(
      { _id: userId, "telegramPreferences.lastDailySummaryDayKey": dayKey },
      { $set: { "telegramPreferences.lastDailySummaryDayKey": previous } },
    )
  } else {
    await User.updateOne(
      { _id: userId, "telegramPreferences.lastDailySummaryDayKey": dayKey },
      { $unset: { "telegramPreferences.lastDailySummaryDayKey": "" } },
    )
  }
  invalidateTelegramPrefsCache(userId)
}

export async function sendDailyTelegramSummary(
  userId: string,
  options?: { force?: boolean },
): Promise<DailyTelegramSummaryResult> {
  const force = Boolean(options?.force)
  if (sending.has(userId)) {
    return { ok: true, skipped: true, message: "Summary already sending" }
  }

  sending.add(userId)
  try {
    const { timezone, prefs } = await loadPrefsAndTimezone(userId)
    const chatId = resolveTelegramChatId(prefs.chatId)
    if (!chatId) {
      return { ok: false, error: "Connect Telegram first." }
    }
    if (!force && !prefs.dailySummaryEnabled) {
      return { ok: true, skipped: true, message: "Daily summary is off" }
    }

    const now = new Date()
    const dayKey = dayKeyInTimezone(now, timezone)
    if (!force) {
      if (!isPastSummaryTime(timeInTimezone(now, timezone), prefs.dailySummaryTime)) {
        return { ok: true, skipped: true, dayKey, message: "Not time yet" }
      }
      if (prefs.lastDailySummaryDayKey === dayKey) {
        return { ok: true, skipped: true, dayKey, message: "Already sent today" }
      }
    }

    const [{ closed, open }, accounts] = await Promise.all([
      loadTodayTrades(userId, timezone, dayKey),
      getUserAccounts(userId),
    ])
    const accountNames = new Map(
      accounts.map((account) => [String(account._id), account.name || "Account"]),
    )
    const { text, totalPnl } = buildDailyTelegramSummaryMessage({
      dayKey,
      timezone,
      asOf: timeInTimezone(now, timezone),
      closed,
      open,
      accountNames,
    })

    if (!force) {
      const claimed = await claimDailySummaryDay(userId, dayKey)
      if (!claimed) {
        return { ok: true, skipped: true, dayKey, message: "Already sent today" }
      }
    }

    const sent = await sendTelegramMessage(chatId, text)
    if (!sent.ok) {
      if (!force) {
        await restoreDailySummaryDay(userId, dayKey, prefs.lastDailySummaryDayKey)
      }
      return { ok: false, error: sent.error || "Failed to send Telegram message", dayKey }
    }

    return {
      ok: true,
      skipped: false,
      dayKey,
      closedCount: closed.length,
      openCount: open.length,
      totalPnl,
      message:
        closed.length + open.length > 0
          ? `Sent ${closed.length} closed trade(s), total ${formatTelegramPnl(totalPnl)}.`
          : "Sent today's summary (no trades yet).",
    }
  } finally {
    sending.delete(userId)
  }
}

export async function maybeSendDueDailyTelegramSummary(userId: string) {
  try {
    return await sendDailyTelegramSummary(userId, { force: false })
  } catch (error) {
    console.warn("[telegram] daily summary failed:", error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Daily summary failed",
    } satisfies DailyTelegramSummaryResult
  }
}
