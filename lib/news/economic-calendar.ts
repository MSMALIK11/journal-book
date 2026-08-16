export type NewsImpact = "High" | "Medium" | "Low" | "Holiday"

export type EconomicEvent = {
  id: string
  title: string
  country: string
  date: string
  impact: NewsImpact
  forecast: string
  previous: string
  actual: string
}

export type DayGroup = {
  key: string
  label: string
  events: EconomicEvent[]
}

const IMPACTS: NewsImpact[] = ["High", "Medium", "Low", "Holiday"]

export function normalizeImpact(value: unknown): NewsImpact {
  const text = String(value ?? "").trim()
  const match = IMPACTS.find((item) => item.toLowerCase() === text.toLowerCase())
  return match ?? "Low"
}

export function eventId(event: Omit<EconomicEvent, "id">) {
  return `${event.date}|${event.country}|${event.title}`
}

export function parseFeed(raw: unknown): EconomicEvent[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null
      const item = row as Record<string, unknown>
      const date = String(item.date ?? "")
      if (!date || Number.isNaN(new Date(date).getTime())) return null

      const event = {
        title: String(item.title ?? "Untitled").trim() || "Untitled",
        country: String(item.country ?? "—").trim().toUpperCase() || "—",
        date,
        impact: normalizeImpact(item.impact),
        forecast: String(item.forecast ?? "").trim(),
        previous: String(item.previous ?? "").trim(),
        actual: String(item.actual ?? "").trim(),
      }
      return { ...event, id: eventId(event) }
    })
    .filter((event): event is EconomicEvent => Boolean(event))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function dayKey(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

export function groupEventsByDay(events: EconomicEvent[], timeZone: string): DayGroup[] {
  const groups = new Map<string, EconomicEvent[]>()
  for (const event of events) {
    const key = dayKey(event.date, timeZone)
    const list = groups.get(key) ?? []
    list.push(event)
    groups.set(key, list)
  }

  return [...groups.entries()].map(([key, dayEvents]) => ({
    key,
    label: formatDayLabel(key, timeZone),
    events: dayEvents,
  }))
}

function formatDayLabel(key: string, timeZone: string) {
  const date = new Date(`${key}T12:00:00`)
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date)
}
