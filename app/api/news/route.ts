import { NextRequest, NextResponse } from "next/server"
import { parseFeed, type EconomicEvent } from "@/lib/news/economic-calendar"
import { getSession } from "@/lib/session"

const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
const CACHE_MS = 10 * 60_000

type CacheEntry = {
  events: EconomicEvent[]
  fetchedAt: number
}

let cache: CacheEntry | null = null

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const now = Date.now()
    if (cache && now - cache.fetchedAt < CACHE_MS) {
      return NextResponse.json({
        events: cache.events,
        source: "forex-factory",
        cached: true,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
      })
    }

    const response = await fetch(FEED_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600 },
    })

    if (!response.ok) {
      if (cache) {
        return NextResponse.json({
          events: cache.events,
          source: "forex-factory",
          cached: true,
          fetchedAt: new Date(cache.fetchedAt).toISOString(),
        })
      }
      return NextResponse.json({ error: "Unable to load economic calendar" }, { status: 502 })
    }

    const events = parseFeed(await response.json())
    cache = { events, fetchedAt: now }

    return NextResponse.json({
      events,
      source: "forex-factory",
      cached: false,
      fetchedAt: new Date(now).toISOString(),
    })
  } catch {
    if (cache) {
      return NextResponse.json({
        events: cache.events,
        source: "forex-factory",
        cached: true,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
      })
    }
    return NextResponse.json({ error: "Unable to load economic calendar" }, { status: 502 })
  }
}
