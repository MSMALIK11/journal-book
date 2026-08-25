export type TelegramPreferences = {
  enabled: boolean
  chatId: string
  notifyOpen: boolean
  notifyClose: boolean
}

export const DEFAULT_TELEGRAM_PREFERENCES: TelegramPreferences = {
  enabled: false,
  chatId: "",
  notifyOpen: true,
  notifyClose: true,
}

export function normalizeChatId(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return ""
  return /^-?\d+$/.test(raw) ? raw : ""
}

export function normalizeTelegramPreferences(
  prefs: Partial<TelegramPreferences> | null | undefined,
): TelegramPreferences {
  return {
    enabled: Boolean(prefs?.enabled),
    chatId: normalizeChatId(prefs?.chatId),
    notifyOpen: prefs?.notifyOpen !== false,
    notifyClose: prefs?.notifyClose !== false,
  }
}

export function isTelegramLinked(prefs: TelegramPreferences) {
  return Boolean(prefs.chatId)
}
