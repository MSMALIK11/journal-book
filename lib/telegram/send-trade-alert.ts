import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import {
  normalizeTelegramPreferences,
  type TelegramPreferences,
} from "@/lib/telegram/settings"

const TELEGRAM_API = "https://api.telegram.org"
const PREFS_CACHE_TTL_MS = 60_000

const prefsCache = new Map<string, { prefs: TelegramPreferences; at: number }>()
let telegramWarmed = false

type TelegramApiResult = {
  ok: boolean
  error?: string
}

type TelegramUpdate = {
  update_id: number
  message?: {
    text?: string
    chat?: { id?: number | string }
  }
}

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  return token || null
}

export function isTelegramBotConfigured() {
  return Boolean(getBotToken())
}

export function getEnvTelegramChatId() {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  return chatId && /^-?\d+$/.test(chatId) ? chatId : null
}

export function resolveTelegramChatId(fallbackChatId?: string) {
  return getEnvTelegramChatId() || fallbackChatId?.trim() || ""
}

function telegramChatIdCandidates(chatId: string) {
  const id = chatId.trim()
  if (!id) return []
  const candidates = [id]
  if (/^-\d+$/.test(id) && !id.startsWith("-100")) {
    candidates.push(`-100${id.slice(1)}`)
  }
  return [...new Set(candidates)]
}

async function telegramRequest<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = getBotToken()
  if (!token) {
    return { ok: false, error: "Telegram bot token is not configured. Add TELEGRAM_BOT_TOKEN to .env." }
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${path}`, {
      ...init,
      cache: "no-store",
      keepalive: true,
      next: { revalidate: 0 },
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    })
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: T }
      | null

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.description || `Telegram request failed (${response.status})`,
      }
    }

    return { ok: true, data: data.result as T }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Telegram request failed",
    }
  }
}

export function warmTelegramConnection() {
  if (telegramWarmed || !getBotToken()) return
  telegramWarmed = true
  void telegramRequest<unknown>("getMe")
}

export function invalidateTelegramPrefsCache(userId?: string) {
  if (userId) prefsCache.delete(userId)
  else prefsCache.clear()
}

export async function getTelegramPrefs(userId: string): Promise<TelegramPreferences> {
  const hit = prefsCache.get(userId)
  if (hit && Date.now() - hit.at < PREFS_CACHE_TTL_MS) return hit.prefs

  await connectDB()
  const user = await User.findById(userId).select("telegramPreferences").lean()
  const prefs = normalizeTelegramPreferences(
    user?.telegramPreferences as Partial<TelegramPreferences> | undefined,
  )
  prefsCache.set(userId, { prefs, at: Date.now() })
  return prefs
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramApiResult> {
  const candidates = telegramChatIdCandidates(chatId)
  if (!candidates.length) {
    return { ok: false, error: "Telegram chat ID is missing" }
  }

  let lastError = "Telegram chat ID is missing"
  for (const candidate of candidates) {
    const result = await telegramRequest<unknown>("sendMessage", {
      method: "POST",
      body: JSON.stringify({
        chat_id: candidate,
        text,
        disable_web_page_preview: true,
      }),
    })
    if (result.ok) return { ok: true }
    lastError = result.error || lastError
    if (!/chat not found/i.test(lastError)) {
      return { ok: false, error: lastError }
    }
  }

  return { ok: false, error: lastError }
}

export async function detectTelegramChatIdFromStart(): Promise<
  { ok: true; chatId: string } | { ok: false; error: string }
> {
  const result = await telegramRequest<TelegramUpdate[]>("getUpdates?limit=50")
  if (!result.ok) return result

  const starts = (result.data || [])
    .filter((update) => {
      const text = update.message?.text?.trim() ?? ""
      return text === "/start" || text.startsWith("/start ")
    })
    .map((update) => ({
      updateId: update.update_id,
      chatId: update.message?.chat?.id,
    }))
    .filter((item) => item.chatId != null)

  const latest = starts.at(-1)
  if (!latest) {
    return {
      ok: false,
      error: "Open the journal bot in Telegram, tap Start, then try Connect again.",
    }
  }

  return { ok: true, chatId: String(latest.chatId) }
}

function formatPrice(price: number) {
  if (!Number.isFinite(price)) return "0"
  return price.toLocaleString("en-US", { maximumFractionDigits: 5 })
}

export function formatTelegramPnl(value: number) {
  const abs = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  if (value > 0) return `+${abs}`
  if (value < 0) return `-${abs}`
  return abs
}

export function formatTelegramReturnPct(value: number) {
  const abs = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })
  if (value > 0) return `+${abs}%`
  if (value < 0) return `-${abs}%`
  return `${abs}%`
}

export const DEMO_TELEGRAM_TRADE = {
  kind: "open" as const,
  side: "Long",
  instrument: "BTCUSDT",
  price: 77029,
  accountName: "Demo",
}

export type TelegramTradeEvent = {
  kind: "open" | "close"
  side: string
  instrument: string
  price: number
  exitPrice?: number
  netPnl?: number
  returnPct?: number
  accountName?: string
  demo?: boolean
}

export function buildTelegramTradeMessage(event: TelegramTradeEvent) {
  const action = event.kind === "open" ? "opened" : "closed"
  const lines = [`${event.side.toUpperCase()} ${action}`]

  if (event.kind === "close" && Number.isFinite(event.exitPrice)) {
    lines.push(`${event.instrument}`)
    lines.push(`${formatPrice(event.price)} → ${formatPrice(event.exitPrice as number)}`)
  } else {
    lines.push(`${event.instrument} @ ${formatPrice(event.price)}`)
  }

  if (event.kind === "close" && typeof event.netPnl === "number" && Number.isFinite(event.netPnl)) {
    const pnl = formatTelegramPnl(event.netPnl)
    const ret =
      typeof event.returnPct === "number" && Number.isFinite(event.returnPct)
        ? ` (${formatTelegramReturnPct(event.returnPct)})`
        : ""
    lines.push(`P&L: ${pnl}${ret}`)
  }

  if (event.accountName) lines.push(`Account: ${event.accountName}`)
  if (event.demo) lines.push("(demo — not a real trade)")
  return lines.join("\n")
}

export async function notifyTelegramTradeEvent(
  userId: string,
  event: {
    kind: "open" | "close"
    side: string
    instrument: string
    price: number
    accountName?: string
    caption?: string
  },
) {
  try {
    if (!isTelegramBotConfigured()) return

    const prefs = await getTelegramPrefs(userId)

    const chatId = resolveTelegramChatId(prefs.chatId)
    if (!prefs.enabled || !chatId) return
    if (event.kind === "open" && !prefs.notifyOpen) return
    if (event.kind === "close" && !prefs.notifyClose) return

    const text = event.caption || buildTelegramTradeMessage(event)
    const result = await sendTelegramMessage(chatId, text)

    if (!result.ok) {
      console.error("Telegram trade alert failed:", result.error)
    }
  } catch (error) {
    console.error("Telegram trade alert failed:", error)
  }
}
