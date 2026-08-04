import { NextRequest, NextResponse } from "next/server"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"
import { dedupeSyncedTradesByExternalId } from "@/lib/trading/sync-dedup"
import { reconcileTradeAccounts } from "@/lib/trading-accounts-server"
import { publishTradesUpdated } from "@/lib/sync-events"

export async function OPTIONS(request: NextRequest) {
  return withSyncCors(request, new NextResponse(null, { status: 204 }))
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getSyncAuth(request)
    if (!auth) {
      return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const { moved, accountIds } = await reconcileTradeAccounts(auth.userId)
    const deduped = await dedupeSyncedTradesByExternalId(auth.userId)

    for (const accountId of accountIds) {
      publishTradesUpdated(auth.userId, accountId, {
        imported: 0,
        updated: moved,
        skipped: 0,
      })
    }

    return withSyncCors(request, NextResponse.json({ moved, deduped, accountIds }))
  } catch (error) {
    console.error("Failed to reconcile from sync:", error)
    return withSyncCors(
      request,
      NextResponse.json({ error: "Unable to reassign trades" }, { status: 500 }),
    )
  }
}
