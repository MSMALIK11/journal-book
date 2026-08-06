import { NextRequest, NextResponse } from "next/server"
import { readdir, readFile } from "fs/promises"
import path from "path"
import {
  getTradingJournalExportRoot,
  resolveMonthlyExportFilePath,
  runMonthlyExportForUser,
} from "@/lib/auto-export-server"
import {
  isLastDayOfMonthInTimezone,
  monthKeyInTimezone,
  monthKeyToYymmdd,
} from "@/lib/trading/export-trades-csv"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { normalizeAutoExportPreferences } from "@/lib/auto-export-settings"
import { getSession } from "@/lib/session"
import { z } from "zod"

const bodySchema = z.object({
  force: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    await connectDB()
    const user = await User.findById(session.sub).select("timezone autoExportPreferences").lean()
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const timezone = user.timezone || "Asia/Kolkata"
    const prefs = normalizeAutoExportPreferences(user.autoExportPreferences)
    const now = new Date()
    const monthKey = monthKeyInTimezone(now, timezone)

    if (!body.data.force) {
      if (!isLastDayOfMonthInTimezone(now, timezone)) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          message: "Monthly export runs on the last day of the month",
          monthKey,
          path: prefs.lastMonthlyExportPath,
          count: prefs.lastMonthlyExportCount ?? 0,
        })
      }

      if (prefs.lastMonthlyExportMonthKey === monthKey) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          message: "This month's export already exists",
          monthKey,
          path: prefs.lastMonthlyExportPath,
          count: prefs.lastMonthlyExportCount ?? 0,
        })
      }
    }

    const result = await runMonthlyExportForUser(session.sub, { monthKey })

    return NextResponse.json({
      ok: true,
      skipped: false,
      monthKey: result.monthKey,
      count: result.count,
      path: result.relativePath,
      absolutePath: result.absolutePath,
      folderName: result.folderName,
      message:
        result.count > 0
          ? `Saved ${result.count} trade(s) on server → ${result.relativePath}`
          : `Empty CSV saved on server → ${result.relativePath} (no trades this month)`,
    })
  } catch (error) {
    console.error("Monthly export failed:", error)
    return NextResponse.json({ error: "Unable to export monthly trades" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const monthKey = request.nextUrl.searchParams.get("month")
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json({ error: "Pass ?month=YYYY-MM" }, { status: 400 })
    }

    await connectDB()
    const user = await User.findById(session.sub).select("autoExportPreferences").lean()
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const prefs = normalizeAutoExportPreferences(user.autoExportPreferences)
    let filePath =
      prefs.lastMonthlyExportMonthKey === monthKey && prefs.lastMonthlyExportPath
        ? prefs.lastMonthlyExportPath
        : resolveMonthlyExportFilePath(prefs.folderName, monthKey).absolutePath

    try {
      await readFile(filePath, "utf8")
    } catch {
      const yymmdd = monthKeyToYymmdd(monthKey)
      const dir = path.join(getTradingJournalExportRoot(), prefs.folderName)
      const files = await readdir(dir)
      const match =
        files.find((file) => file.endsWith(`_${yymmdd}.csv`)) ||
        files.find((file) => file === `${monthKey}.csv`)
      if (!match) throw new Error("not found")
      filePath = path.join(dir, match)
    }

    const csv = await readFile(filePath, "utf8")
    const fileName = path.basename(filePath)

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "Export file not found" }, { status: 404 })
  }
}
