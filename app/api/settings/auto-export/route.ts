import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import {
  isValidExportTime,
  normalizeAutoExportPreferences,
  type AutoExportPreferences,
} from "@/lib/auto-export-settings"
import { describeExportRoot, getTradingJournalExportRoot } from "@/lib/auto-export-server"
import { getSession } from "@/lib/session"
import { z } from "zod"

const autoExportSchema = z.object({
  enabled: z.boolean().optional(),
  monthlyEnabled: z.boolean().optional(),
  time: z
    .string()
    .optional()
    .refine((value) => value == null || isValidExportTime(value), "Invalid time (use HH:mm)"),
  folderName: z.string().max(48).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()
    const user = await User.findById(session.sub).select("autoExportPreferences timezone").lean()

    const preferences = normalizeAutoExportPreferences(
      user?.autoExportPreferences as Partial<AutoExportPreferences> | undefined,
    )

    return NextResponse.json({
      preferences,
      timezone: user?.timezone || "Asia/Kolkata",
      exportRoot: getTradingJournalExportRoot(),
      exportRootLabel: describeExportRoot(),
      exportFolderPath: `${describeExportRoot()}/${preferences.folderName}`,
    })
  } catch (error) {
    console.error("Failed to load auto-export preferences:", error)
    return NextResponse.json({ error: "Unable to load auto-export preferences" }, { status: 500 })
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

    const parsed = autoExportSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid preferences" },
        { status: 400 },
      )
    }

    await connectDB()
    const user = await User.findById(session.sub)
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const current = normalizeAutoExportPreferences(user.autoExportPreferences as Partial<AutoExportPreferences>)
    user.autoExportPreferences = normalizeAutoExportPreferences({ ...current, ...parsed.data })
    await user.save()

    const preferences = normalizeAutoExportPreferences(
      user.autoExportPreferences as Partial<AutoExportPreferences>,
    )

    return NextResponse.json({
      preferences,
      timezone: user.timezone || "Asia/Kolkata",
      exportRoot: getTradingJournalExportRoot(),
      exportRootLabel: describeExportRoot(),
      exportFolderPath: `${describeExportRoot()}/${preferences.folderName}`,
    })
  } catch (error) {
    console.error("Failed to update auto-export preferences:", error)
    return NextResponse.json({ error: "Unable to update auto-export preferences" }, { status: 500 })
  }
}
