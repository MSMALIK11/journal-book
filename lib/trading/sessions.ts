export type TradingSession = "Asia" | "London" | "NewYork" | "Overlap" | "Other"

export const SESSION_LABELS: Record<TradingSession, string> = {
  Asia: "Asia (00–08)",
  London: "London (08–16)",
  NewYork: "New York (13–21)",
  Overlap: "London/NY Overlap (13–16)",
  Other: "Other hours",
}

/** Classify hour (0–23 in user timezone) into primary session. Overlap takes precedence. */
export function classifySession(hour: number): TradingSession {
  if (hour >= 13 && hour < 16) return "Overlap"
  if (hour >= 0 && hour < 8) return "Asia"
  if (hour >= 8 && hour < 16) return "London"
  if (hour >= 13 && hour < 21) return "NewYork"
  return "Other"
}

export function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  })

  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""

  const hour = Number.parseInt(get("hour"), 10)
  const weekday = get("weekday")
  const month = get("year") + "-" + get("month")
  const day = get("year") + "-" + get("month") + "-" + get("day")

  return {
    hour: Number.isFinite(hour) ? hour : 0,
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
