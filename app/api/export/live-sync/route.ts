import { NextRequest, NextResponse } from "next/server"
import { runLiveSyncFolderExport } from "@/lib/auto-export-server"
import { normalizeAutoExportPreferences } from "@/lib/auto-export-settings"
import { safeExportSymbol } from "@/lib/trading/export-trades-csv"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { getSession } from "@/lib/session"
import { z } from "zod"

const bodySchema = z.object({
  scope: z.enum(["today", "month", "all"]).default("today"),
  symbol: z.string().trim().min(1).max(40),
  accountId: z.string().trim().min(1).max(80).optional(),
  /** YYYY-MM when exporting a specific month from the Live Sync month list */
  monthKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "monthKey must be YYYY-MM")
    .optional(),
})

/**
 * Live Sync save — same home folder as Settings auto-export:
 * ~/TradingJournal/{settings.folderName}/{SYMBOL}_{yymmdd}.csv
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message || "Invalid request" },
        { status: 400 },
      )
    }

    if (body.data.scope === "month" && !body.data.monthKey) {
      // allow current month when monthKey omitted
    }

    await connectDB()
    const user = await User.findById(session.sub).select("autoExportPreferences").lean()
    const prefs = normalizeAutoExportPreferences(user?.autoExportPreferences)

    const result = await runLiveSyncFolderExport(session.sub, {
      scope: body.data.scope,
      symbol: safeExportSymbol(body.data.symbol),
      accountId: body.data.accountId,
      folderName: prefs.folderName,
      monthKey: body.data.monthKey,
    })

    return NextResponse.json({
      ok: true,
      scope: result.scope,
      symbol: result.symbol,
      fileName: result.fileName,
      monthKey: result.monthKey,
      count: result.count,
      path: result.relativePath,
      absolutePath: result.absolutePath,
      folderName: result.folderName,
      message:
        result.count > 0
          ? `Saved ${result.count} trade(s) → ${result.absolutePath}`
          : `Empty CSV saved → ${result.absolutePath}`,
    })
  } catch (error) {
    console.error("Live Sync export failed:", error)
    return NextResponse.json({ error: "Unable to save Live Sync export" }, { status: 500 })
  }
}
