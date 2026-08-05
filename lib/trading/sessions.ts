export type TradingSession =
  | "PreAsia"
  | "AsiaOpen"
  | "AsiaMid"
  | "AsiaClose"
  | "PreLondon"
  | "LondonOpen"
  | "LondonMid"
  | "LondonNyOverlap"
  | "NewYorkOpen"
  | "NewYorkMid"
  | "NewYorkClose"
  | "DeadZone"

export type SessionDef = {
  key: TradingSession
  label: string
  shortLabel: string
  timeRange: string
  /** Minutes from midnight, start inclusive */
  start: number
  /** Minutes from midnight, end exclusive (may wrap past midnight) */
  end: number
  /** 5 = key session (London Open, Overlap, NY Open) */
  tier?: 5
}

function hm(h: number, m: number): number {
  return h * 60 + m
}

/** Session windows in user local time (matches your trading clock). */
export const TRADING_SESSIONS: SessionDef[] = [
  { key: "DeadZone", label: "Dead Zone", shortLabel: "Dead Zone", timeRange: "02:30 – 03:30", start: hm(2, 30), end: hm(3, 30) },
  { key: "PreAsia", label: "Pre Asia", shortLabel: "Pre Asia", timeRange: "03:30 – 05:30", start: hm(3, 30), end: hm(5, 30) },
  { key: "AsiaOpen", label: "Asia Open", shortLabel: "Asia Open", timeRange: "05:30 – 08:00", start: hm(5, 30), end: hm(8, 0) },
  { key: "AsiaMid", label: "Asia", shortLabel: "Asia", timeRange: "08:00 – 11:00", start: hm(8, 0), end: hm(11, 0) },
  { key: "AsiaClose", label: "Asia Close", shortLabel: "Asia Close", timeRange: "11:00 – 13:30", start: hm(11, 0), end: hm(13, 30) },
  { key: "PreLondon", label: "Pre London", shortLabel: "Pre London", timeRange: "13:30 – 15:00", start: hm(13, 30), end: hm(15, 0) },
  { key: "LondonOpen", label: "London Open", shortLabel: "London Open", timeRange: "15:00 – 17:00", start: hm(15, 0), end: hm(17, 0), tier: 5 },
  { key: "LondonMid", label: "London", shortLabel: "London", timeRange: "17:00 – 18:30", start: hm(17, 0), end: hm(18, 30) },
  { key: "NewYorkOpen", label: "New York Open", shortLabel: "New York Open", timeRange: "18:30 – 20:30", start: hm(18, 30), end: hm(20, 30), tier: 5 },
  { key: "LondonNyOverlap", label: "London + NY Overlap", shortLabel: "Overlap", timeRange: "20:30 – 21:30", start: hm(18, 30), end: hm(21, 30), tier: 5 },
  { key: "NewYorkMid", label: "New York", shortLabel: "New York", timeRange: "20:30 – 23:30", start: hm(20, 30), end: hm(23, 30) },
  { key: "NewYorkClose", label: "New York Close", shortLabel: "New York Close", timeRange: "23:30 – 02:30", start: hm(23, 30), end: hm(2, 30) },
]

/** Chronological order for charts and timelines. */
export const SESSION_ORDER: TradingSession[] = TRADING_SESSIONS.map((s) => s.key)

/**
 * Classification order — NY Open before Overlap so 18:30–20:30 maps to NY Open,
 * 20:30–21:30 maps to London + NY Overlap.
 */
export const SESSION_CLASSIFY_ORDER: TradingSession[] = [
  "DeadZone",
  "PreAsia",
  "AsiaOpen",
  "AsiaMid",
  "AsiaClose",
  "PreLondon",
  "LondonOpen",
  "LondonMid",
  "NewYorkOpen",
  "LondonNyOverlap",
  "NewYorkMid",
  "NewYorkClose",
]

export const SESSION_LABELS: Record<TradingSession, string> = Object.fromEntries(
  TRADING_SESSIONS.map((s) => [s.key, s.label]),
) as Record<TradingSession, string>

/** Chart / tooltip — name + time on two readable parts */
export const SESSION_DETAIL_LABELS: Record<TradingSession, string> = Object.fromEntries(
  TRADING_SESSIONS.map((s) => [s.key, `${s.label} · ${s.timeRange}`]),
) as Record<TradingSession, string>

export const SESSION_SHORT_LABELS: Record<TradingSession, string> = Object.fromEntries(
  TRADING_SESSIONS.map((s) => [s.key, s.shortLabel]),
) as Record<TradingSession, string>

const SESSION_BY_KEY = new Map(TRADING_SESSIONS.map((s) => [s.key, s]))

export function getSessionDef(key: TradingSession): SessionDef {
  return SESSION_BY_KEY.get(key)!
}

export function isPremiumSession(key: TradingSession): boolean {
  return getSessionDef(key).tier === 5
}

export function isOverlapSession(key: TradingSession): boolean {
  return key === "LondonNyOverlap"
}

export function formatSessionDisplay(key: TradingSession) {
  const def = getSessionDef(key)
  return {
    name: def.shortLabel,
    fullName: def.label,
    time: def.timeRange,
    tier: def.tier,
    isOverlap: isOverlapSession(key),
  }
}

/** London + NY overlap window 18:30 – 21:30 (shows overlap badge alongside NY Open). */
export function isOverlapWindow(hour: number, minute = 0): boolean {
  const minutes = hour * 60 + minute
  return minutes >= hm(18, 30) && minutes < hm(21, 30)
}

function isMinuteInRange(minutes: number, start: number, end: number): boolean {
  if (start === end) return false
  if (start < end) return minutes >= start && minutes < end
  return minutes >= start || minutes < end
}

export function classifySession(hour: number, minute = 0): TradingSession {
  const minutes = hour * 60 + minute

  for (const key of SESSION_CLASSIFY_ORDER) {
    const def = getSessionDef(key)
    if (isMinuteInRange(minutes, def.start, def.end)) return key
  }

  return "DeadZone"
}

export function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  })

  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""

  const hour = Number.parseInt(get("hour"), 10)
  const minute = Number.parseInt(get("minute"), 10)
  const weekday = get("weekday")
  const month = get("year") + "-" + get("month")
  const day = get("year") + "-" + get("month") + "-" + get("day")
  const safeHour = Number.isFinite(hour) ? hour : 0
  const safeMinute = Number.isFinite(minute) ? minute : 0

  return {
    hour: safeHour,
    minute: safeMinute,
    timeMinutes: safeHour * 60 + safeMinute,
    weekday,
    month,
    day,
  }
}

export const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export function normalizeWeekday(short: string): string {
  const map: Record<string, string> = {
    Mon: "Mon",
    Tue: "Tue",
    Wed: "Wed",
    Thu: "Thu",
    Fri: "Fri",
    Sat: "Sat",
    Sun: "Sun",
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
    Sunday: "Sun",
  }
  return map[short] ?? short.slice(0, 3)
}
