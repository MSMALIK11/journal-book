import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { getSession } from "@/lib/session"
import {
  DEFAULT_TELEGRAM_PREFERENCES,
  normalizeChatId,
  normalizeTelegramPreferences,
  type TelegramPreferences,
} from "@/lib/telegram/settings"
import {
  DEMO_TELEGRAM_TRADE,
  detectTelegramChatIdFromStart,
  getTelegramPrefs,
  invalidateTelegramPrefsCache,
  isTelegramBotConfigured,
  resolveTelegramChatId,
  sendTelegramMessage,
  warmTelegramConnection,
} from "@/lib/telegram/send-trade-alert"
import { buildTelegramCaptionForAccount } from "@/lib/trading/alerts-server"
import { getDefaultAccountId } from "@/lib/trading-accounts-server"

const telegramSchema = z.object({
  enabled: z.boolean().optional(),
  chatId: z.string().max(32).optional(),
  notifyOpen: z.boolean().optional(),
  notifyClose: z.boolean().optional(),
})

const telegramActionSchema = z.object({
  action: z.enum(["test", "detect", "demo"]),
  accountId: z.string().max(40).optional(),
})

function publicPreferences(prefs: Partial<TelegramPreferences> | null | undefined) {
  const preferences = normalizeTelegramPreferences(prefs)
  return {
    preferences,
    botConfigured: isTelegramBotConfigured(),
    destinationConfigured: Boolean(resolveTelegramChatId(preferences.chatId)),
  }
}

async function loadUser(userId: string) {
  await connectDB()
  return User.findById(userId)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await loadUser(session.sub)
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    warmTelegramConnection()

    return NextResponse.json(
      publicPreferences(user.telegramPreferences as Partial<TelegramPreferences> | undefined),
    )
  } catch (error) {
    console.error("Failed to load Telegram preferences:", error)
    return NextResponse.json({ error: "Unable to load Telegram preferences" }, { status: 500 })
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

    const body = await request.json().catch(() => null)
    const parsed = telegramSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid preferences" },
        { status: 400 },
      )
    }

    if (parsed.data.chatId != null && parsed.data.chatId.trim() && !normalizeChatId(parsed.data.chatId)) {
      return NextResponse.json({ error: "Chat ID must be a number, for example 123456789" }, { status: 400 })
    }

    const user = await loadUser(session.sub)
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    user.telegramPreferences = normalizeTelegramPreferences({
      ...DEFAULT_TELEGRAM_PREFERENCES,
      ...(user.telegramPreferences || {}),
      ...parsed.data,
    })
    await user.save()
    invalidateTelegramPrefsCache(session.sub)

    return NextResponse.json(
      publicPreferences(user.telegramPreferences as TelegramPreferences),
    )
  } catch (error) {
    console.error("Failed to update Telegram preferences:", error)
    return NextResponse.json({ error: "Unable to update Telegram preferences" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const [session, body] = await Promise.all([
      getSession(request),
      request.json().catch(() => null),
    ])
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = telegramActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    warmTelegramConnection()

    if (parsed.data.action === "detect") {
      const user = await loadUser(session.sub)
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

      const prefs = normalizeTelegramPreferences(
        user.telegramPreferences as Partial<TelegramPreferences> | undefined,
      )
      const detected = await detectTelegramChatIdFromStart()
      if (!detected.ok) {
        return NextResponse.json({ error: detected.error }, { status: 400 })
      }

      user.telegramPreferences = normalizeTelegramPreferences({
        ...prefs,
        enabled: true,
        chatId: detected.chatId,
      })
      await user.save()
      invalidateTelegramPrefsCache(session.sub)

      return NextResponse.json({
        ...publicPreferences(user.telegramPreferences as TelegramPreferences),
        message: "Telegram chat connected.",
      })
    }

    const prefs = await getTelegramPrefs(session.sub)
    const chatId = resolveTelegramChatId(prefs.chatId)

    if (!chatId) {
      return NextResponse.json(
        { error: "Connect Telegram first." },
        { status: 400 },
      )
    }

    const accountId = parsed.data.accountId || (await getDefaultAccountId(session.sub))
    const text =
      parsed.data.action === "demo"
        ? await buildTelegramCaptionForAccount(session.sub, accountId, {
            ...DEMO_TELEGRAM_TRADE,
            demo: true,
          })
        : "Telegram connected\nJournal Book will notify you when a trade opens or closes."

    const sent = await sendTelegramMessage(chatId, text)
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error || "Failed to send Telegram message" }, { status: 400 })
    }

    return NextResponse.json({
      ...publicPreferences(prefs),
      message:
        parsed.data.action === "demo"
          ? "Demo trade sent. Check Telegram on your phone."
          : "Test message sent.",
    })
  } catch (error) {
    console.error("Failed Telegram settings action:", error)
    return NextResponse.json({ error: "Unable to complete Telegram action" }, { status: 500 })
  }
}
