import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { normalizeWatchSymbols } from "@/lib/trading/watch-symbols"
import { getSession } from "@/lib/session"
import { z } from "zod"

const watchSymbolsSchema = z.object({
  watch_symbols: z.array(z.string()).max(5),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()
    const user = await User.findById(session.sub).select("watch_symbols").lean()

    return NextResponse.json({
      watch_symbols: normalizeWatchSymbols(user?.watch_symbols),
    })
  } catch (error) {
    console.error("Failed to load watch symbols:", error)
    return NextResponse.json({ error: "Unable to load watch symbols" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = watchSymbolsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid watch symbols" },
        { status: 400 },
      )
    }

    const watch_symbols = normalizeWatchSymbols(parsed.data.watch_symbols)

    await connectDB()
    const user = await User.findById(session.sub)
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    user.watch_symbols = watch_symbols
    await user.save()

    return NextResponse.json({ watch_symbols })
  } catch (error) {
    console.error("Failed to update watch symbols:", error)
    return NextResponse.json({ error: "Unable to update watch symbols" }, { status: 500 })
  }
}
