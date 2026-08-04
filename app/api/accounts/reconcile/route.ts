import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { dedupeSyncedTradesByExternalId } from "@/lib/trading/sync-dedup"
import { reconcileTradeAccounts } from "@/lib/trading-accounts-server"

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { moved, accountIds } = await reconcileTradeAccounts(session.sub)
    const deduped = await dedupeSyncedTradesByExternalId(session.sub)

    return NextResponse.json({ moved, deduped, accountIds })
  } catch (error) {
    console.error("Failed to reconcile trade accounts:", error)
    return NextResponse.json({ error: "Unable to reassign trades" }, { status: 500 })
  }
}
