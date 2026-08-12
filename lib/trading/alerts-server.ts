import connectDB from "@/app/api/db/mongoose"
import TradingAlert from "@/app/api/models/TradingAlert"
import User from "@/app/api/models/User"
import TradingAccount from "@/app/api/models/TradingAccount"
import {
  buildDailyDigest,
  dedupeAlerts,
  DEFAULT_ALERT_PREFERENCES,
  evaluateTradingAlerts,
  getTopActionAlert,
  rankAndCapAlerts,
  type AlertPreferences,
  type TradingAlertPayload,
} from "@/lib/trading/alerts"
import { buildCoachingVerdict } from "@/lib/trading/coaching-verdict"
import { getCurrentMomentZones } from "@/lib/trading/trade-zones"
import { getZonedParts } from "@/lib/trading/sessions"
import {
  buildTradeQuery,
  fetchClosedTrades,
  RESEARCH_TRADE_SELECT,
} from "@/lib/trading/trade-query"

export function formatAlert(alert: {
  _id?: unknown
  key: string
  category: string
  severity: string
  title: string
  message: string
  metric?: string
  action?: string
  context?: Record<string, unknown>
  read: boolean
  triggeredAt: Date | string
}) {
  return {
    id: String(alert._id),
    key: alert.key,
    category: alert.category,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    metric: alert.metric,
    action: alert.action,
    context: alert.context || {},
    read: alert.read,
    triggeredAt:
      alert.triggeredAt instanceof Date
        ? alert.triggeredAt.toISOString()
        : String(alert.triggeredAt),
  }
}

export async function getUserAlertPreferences(userId: string): Promise<AlertPreferences> {
  await connectDB()
  const user = await User.findById(userId).select("alertPreferences").lean()
  return {
    ...DEFAULT_ALERT_PREFERENCES,
    ...(user?.alertPreferences as Partial<AlertPreferences> | undefined),
  }
}

export async function loadAccountAlertContext(userId: string, accountId: string) {
  await connectDB()

  const [user, account, trades] = await Promise.all([
    User.findById(userId).select("timezone alertPreferences").lean(),
    TradingAccount.findOne({ _id: accountId, userId }).lean(),
    fetchClosedTrades(
      buildTradeQuery(userId, accountId, {
        source: "all",
        strategy: null,
        instrument: null,
        startDate: null,
        endDate: null,
      }),
      RESEARCH_TRADE_SELECT,
    ),
  ])

  const timezone = user?.timezone || "Asia/Karachi"
  const preferences = {
    ...DEFAULT_ALERT_PREFERENCES,
    ...(user?.alertPreferences as Partial<AlertPreferences> | undefined),
  }
  const instrumentLabel = account?.name || account?.symbols?.[0] || "this account"

  return { trades, timezone, preferences, instrumentLabel, account }
}

export async function persistAlerts(
  userId: string,
  accountId: string,
  payloads: TradingAlertPayload[],
) {
  if (!payloads.length) return []

  const now = new Date()
  const created: ReturnType<typeof formatAlert>[] = []

  for (const payload of payloads) {
    const doc = await TradingAlert.findOneAndUpdate(
      { userId, accountId, key: payload.key },
      {
        $set: {
          category: payload.category,
          severity: payload.severity,
          title: payload.title,
          message: payload.message,
          metric: payload.metric,
          action: payload.action,
          context: payload.context,
          triggeredAt: now,
          read: false,
        },
        $setOnInsert: {
          userId,
          accountId,
          key: payload.key,
        },
      },
      { upsert: true, returnDocument: "after" },
    )

    if (doc) {
      created.push(formatAlert(doc))
    }
  }

  return created
}

export async function evaluateAndPersistAlerts(
  userId: string,
  accountId: string,
  options: { includeDigest?: boolean } = {},
) {
  const { trades, timezone, preferences, instrumentLabel } = await loadAccountAlertContext(
    userId,
    accountId,
  )

  const contextual = evaluateTradingAlerts(trades, {
    timezone,
    preferences,
    instrumentLabel,
  })

  const payloads = [...contextual]

  if (options.includeDigest) {
    const digest = buildDailyDigest(trades, {
      timezone,
      preferences,
      instrumentLabel,
    })
    if (digest) payloads.push(digest)
  }

  const unique = dedupeAlerts(payloads)
  const persisted = await persistAlerts(userId, accountId, unique)

  return { alerts: unique, persisted }
}

export async function getAlertsForAccount(
  userId: string,
  accountId: string,
  options: { limit?: number } = {},
) {
  await connectDB()
  const limit = options.limit ?? 50

  const { trades, timezone, preferences, instrumentLabel } = await loadAccountAlertContext(
    userId,
    accountId,
  )

  const allPayloads = evaluateTradingAlerts(trades, {
    timezone,
    preferences,
    instrumentLabel,
  })

  const digest = buildDailyDigest(trades, { timezone, preferences, instrumentLabel })
  const topActionPayload = getTopActionAlert(allPayloads)
  const activePayloads = rankAndCapAlerts(allPayloads)

  const active = dedupeAlerts(activePayloads).map((alert) => ({
    id: alert.key,
    key: alert.key,
    category: alert.category,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    metric: alert.metric,
    action: alert.action,
    context: alert.context,
    read: false,
    triggeredAt: new Date().toISOString(),
  }))

  const topAction = topActionPayload
    ? {
        id: topActionPayload.key,
        key: topActionPayload.key,
        category: topActionPayload.category,
        severity: topActionPayload.severity,
        title: topActionPayload.title,
        message: topActionPayload.message,
        metric: topActionPayload.metric,
        action: topActionPayload.action,
        context: topActionPayload.context,
        read: false,
        triggeredAt: new Date().toISOString(),
      }
    : null

  const [stored, unreadCount] = await Promise.all([
    TradingAlert.find({ userId, accountId }).sort({ triggeredAt: -1 }).limit(limit).lean(),
    TradingAlert.countDocuments({ userId, accountId, read: false }),
  ])

  const zones = getCurrentMomentZones(trades, { timezone, instrumentLabel })
  const verdict = buildCoachingVerdict(allPayloads, zones)

  return {
    active,
    topAction,
    history: stored.map(formatAlert),
    unreadCount,
    zones,
    verdict,
    timezone,
  }
}

export async function markAlertsRead(
  userId: string,
  accountId: string,
  options: { ids?: string[]; all?: boolean },
) {
  await connectDB()

  if (options.all) {
    await TradingAlert.updateMany({ userId, accountId, read: false }, { $set: { read: true } })
    return
  }

  if (options.ids?.length) {
    await TradingAlert.updateMany(
      { userId, accountId, _id: { $in: options.ids } },
      { $set: { read: true } },
    )
  }
}

export async function digestExistsForToday(userId: string, accountId: string, timezone: string) {
  await connectDB()
  const { day } = getZonedParts(new Date(), timezone)
  const key = `digest:${day}`
  const existing = await TradingAlert.findOne({ userId, accountId, key }).select("_id").lean()
  return Boolean(existing)
}
