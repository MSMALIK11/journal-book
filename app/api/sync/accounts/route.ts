import { NextRequest, NextResponse } from "next/server"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"
import { formatAccount, getUserAccounts } from "@/lib/trading-accounts-server"

export async function OPTIONS(request: NextRequest) {
  return withSyncCors(request, new NextResponse(null, { status: 204 }))
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getSyncAuth(request)
    if (!auth) {
      return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const accounts = await getUserAccounts(auth.userId)

    return withSyncCors(
      request,
      NextResponse.json({
        accounts: accounts.map(formatAccount),
      }),
    )
  } catch (error) {
    console.error("Failed to load sync accounts:", error)
    return withSyncCors(
      request,
      NextResponse.json({ error: "Unable to load accounts" }, { status: 500 }),
    )
  }
}
