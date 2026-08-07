import { NextRequest, NextResponse } from "next/server"
import { subDays, addDays } from "date-fns"
import DayJournal, { type DayGrade, type ProcessFollowed } from "@/app/api/models/DayJournal"
import Trade from "@/app/api/models/Trade"
import TradingAccount from "@/app/api/models/TradingAccount"
import User from "@/app/api/models/User"
import connectDB from "@/app/api/db/mongoose"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import {
  buildDayJournalSnapshot,
  type DayJournalTradeInput,
} from "@/lib/trading/day-journal-snapshot"
import { dayKeyInTimezone } from "@/lib/trading/export-trades-csv"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PROCESS_VALUES = new Set<ProcessFollowed>(["yes", "partial", "no"])
const GRADE_VALUES = new Set<DayGrade>(["A", "B", "C", "D", "F"])

function serializeJournal(doc: {
  dateKey: string
  accountId: string
  whatWentWell?: string
  whatWentWrong?: string
  lessonsLearned?: string
  marketRead?: string
  tomorrowPlan?: string
  processFollowed?: ProcessFollowed | null
  dayGrade?: DayGrade | null
  tags?: string[]
  updatedAt?: Date
}) {
  return {
    dateKey: doc.dateKey,
    accountId: String(doc.accountId),
    whatWentWell: doc.whatWentWell ?? "",
    whatWentWrong: doc.whatWentWrong ?? "",
    lessonsLearned: doc.lessonsLearned ?? "",
    marketRead: doc.marketRead ?? "",
    tomorrowPlan: doc.tomorrowPlan ?? "",
    processFollowed: doc.processFollowed ?? null,
    dayGrade: doc.dayGrade ?? null,
    tags: doc.tags ?? [],
    updatedAt: doc.updatedAt ?? null,
  }
}

async function resolveAccountId(request: NextRequest, userId: string, requested?: string | null) {
  const { accountId: activeAccountId } = await getAccountContext(request, userId)
  if (!requested || requested === "active") return activeAccountId

  const owned = await TradingAccount.findOne({ _id: requested, userId }).select("_id").lean()
  if (!owned) {
    throw new Error("ACCOUNT_NOT_FOUND")
  }
  return String(owned._id)
}

async function loadDaySnapshot(
  userId: string,
  accountId: string,
  dateKey: string,
  timezone: string,
) {
  const anchor = new Date(`${dateKey}T12:00:00.000Z`)
  const from = subDays(anchor, 1)
  const to = addDays(anchor, 2)

  const rows = await Trade.find({
    userId,
    accountId,
    entry_date: { $gte: from, $lt: to },
  })
    .select("instrument entry_date exit_date net_pnl")
    .lean()

  const dayTrades: DayJournalTradeInput[] = rows
    .filter((row) => {
      const entry = row.entry_date instanceof Date ? row.entry_date : new Date(row.entry_date)
      return dayKeyInTimezone(entry, timezone) === dateKey
    })
    .map((row) => ({
      instrument: row.instrument,
      entry_date: new Date(row.entry_date).toISOString(),
      exit_date: row.exit_date ? new Date(row.exit_date).toISOString() : null,
      net_pnl: typeof row.net_pnl === "number" ? row.net_pnl : null,
    }))

  // Avoid lists come from client analytics so snapshot matches calendar weak badges.
  return buildDayJournalSnapshot(dayTrades, null, timezone)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const dateKey = request.nextUrl.searchParams.get("date")
    if (!dateKey || !DATE_PATTERN.test(dateKey)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    }

    await connectDB()
    let accountId: string
    try {
      accountId = await resolveAccountId(
        request,
        session.sub,
        request.nextUrl.searchParams.get("account"),
      )
    } catch (error) {
      if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
        return NextResponse.json({ error: "Account not found" }, { status: 404 })
      }
      throw error
    }

    const user = await User.findById(session.sub).select("timezone").lean()
    const timezone =
      (user as { timezone?: string } | null)?.timezone ||
      request.nextUrl.searchParams.get("timezone") ||
      "UTC"

    const [journal, snapshot] = await Promise.all([
      DayJournal.findOne({ userId: session.sub, accountId, dateKey }).lean(),
      loadDaySnapshot(session.sub, accountId, dateKey, timezone),
    ])

    return NextResponse.json(
      {
        journal: journal ? serializeJournal(journal) : null,
        snapshot,
        accountId,
        dateKey,
        timezone,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to load day journal:", error)
    return NextResponse.json({ error: "Unable to load day journal" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const dateKey = typeof body.dateKey === "string" ? body.dateKey : body.date
    if (!dateKey || !DATE_PATTERN.test(dateKey)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    }

    await connectDB()
    let accountId: string
    try {
      accountId = await resolveAccountId(
        request,
        session.sub,
        typeof body.accountId === "string" ? body.accountId : null,
      )
    } catch (error) {
      if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
        return NextResponse.json({ error: "Account not found" }, { status: 404 })
      }
      throw error
    }

    const processFollowed =
      body.processFollowed == null || body.processFollowed === ""
        ? null
        : PROCESS_VALUES.has(body.processFollowed)
          ? (body.processFollowed as ProcessFollowed)
          : null

    const dayGrade =
      body.dayGrade == null || body.dayGrade === ""
        ? null
        : GRADE_VALUES.has(body.dayGrade)
          ? (body.dayGrade as DayGrade)
          : null

    if (body.processFollowed != null && body.processFollowed !== "" && processFollowed == null) {
      return NextResponse.json({ error: "Invalid processFollowed" }, { status: 400 })
    }
    if (body.dayGrade != null && body.dayGrade !== "" && dayGrade == null) {
      return NextResponse.json({ error: "Invalid dayGrade" }, { status: 400 })
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string").slice(0, 20)
      : undefined

    const update: Record<string, unknown> = {
      whatWentWell: typeof body.whatWentWell === "string" ? body.whatWentWell : "",
      whatWentWrong: typeof body.whatWentWrong === "string" ? body.whatWentWrong : "",
      lessonsLearned: typeof body.lessonsLearned === "string" ? body.lessonsLearned : "",
      marketRead: typeof body.marketRead === "string" ? body.marketRead : "",
      tomorrowPlan: typeof body.tomorrowPlan === "string" ? body.tomorrowPlan : "",
    }
    if (processFollowed) update.processFollowed = processFollowed
    if (dayGrade) update.dayGrade = dayGrade
    if (tags) update.tags = tags

    const unset: Record<string, 1> = {}
    if (!processFollowed) unset.processFollowed = 1
    if (!dayGrade) unset.dayGrade = 1

    const journal = await DayJournal.findOneAndUpdate(
      { userId: session.sub, accountId, dateKey },
      {
        $set: update,
        $setOnInsert: { userId: session.sub, accountId, dateKey },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    return NextResponse.json(
      { journal: serializeJournal(journal!) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to save day journal:", error)
    return NextResponse.json({ error: "Unable to save day journal" }, { status: 500 })
  }
}
