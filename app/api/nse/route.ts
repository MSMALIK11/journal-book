import { NextResponse } from "next/server"

export async function GET() {
  try {
    const res = await fetch("https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.nseindia.com/",
      },
      // Note: Caching is disabled
      cache: "no-store",
    })

    const data = await res.json()

    const index = data?.data?.[0]
    if (!index) return NextResponse.json({ error: "No data" }, { status: 404 })

    return NextResponse.json({
      name: index.indexName,
      last: index.last,
      high: index.dayHigh,
      low: index.dayLow,
      change: index.change,
      pChange: index.pChange,
    })
  } catch (error) {
    console.error("NSE fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
