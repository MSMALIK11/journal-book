export type TelegramPreferences = {
  enabled: boolean
  chatId: string
  notifyOpen: boolean
  notifyClose: boolean
  /** Chart screenshot after open text alert — off by default so alerts stay instant. */
  chartPhotoOnOpen: boolean
  /** Chart screenshot after close text alert. */
  chartPhotoOnClose: boolean
  dailySummaryEnabled: boolean
  /** 24h HH:mm in the user's timezone */
  dailySummaryTime: string
  lastDailySummaryDayKey?: string
}

export const DEFAULT_TELEGRAM_PREFERENCES: TelegramPreferences = {
  enabled: false,
  chatId: "",
  notifyOpen: true,
  notifyClose: true,
  chartPhotoOnOpen: false,
  chartPhotoOnClose: true,
  dailySummaryEnabled: true,
  dailySummaryTime: "23:00",
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidDailySummaryTime(value: string) {
  return TIME_PATTERN.test(value)
}

export const DAILY_SUMMARY_TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, "0")}:00`
  const label =
    hour === 0
      ? "12:00 AM"
      : hour < 12
        ? `${hour}:00 AM`
        : hour === 12
          ? "12:00 PM"
          : `${hour - 12}:00 PM`
  return { value, label }
})

export function normalizeChatId(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return ""
  return /^-?\d+$/.test(raw) ? raw : ""
}

export function normalizeTelegramPreferences(
  prefs: Partial<TelegramPreferences> | null | undefined,
): TelegramPreferences {
  const lastDailySummaryDayKey =
    typeof prefs?.lastDailySummaryDayKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(prefs.lastDailySummaryDayKey)
      ? prefs.lastDailySummaryDayKey
      : undefined

  return {
    enabled: Boolean(prefs?.enabled),
    chatId: normalizeChatId(prefs?.chatId),
    notifyOpen: prefs?.notifyOpen !== false,
    notifyClose: prefs?.notifyClose !== false,
    chartPhotoOnOpen: prefs?.chartPhotoOnOpen === true,
    chartPhotoOnClose: prefs?.chartPhotoOnClose !== false,
    dailySummaryEnabled: prefs?.dailySummaryEnabled !== false,
    dailySummaryTime: isValidDailySummaryTime(prefs?.dailySummaryTime || "")
      ? prefs!.dailySummaryTime!
      : DEFAULT_TELEGRAM_PREFERENCES.dailySummaryTime,
    lastDailySummaryDayKey,
  }
}

export function isTelegramLinked(prefs: TelegramPreferences) {
  return Boolean(prefs.chatId)
}

/** Keep text alerts fast — only return chart photo keys the user enabled. */
export function filterChartPhotoAlertKeys(
  keys: string[],
  prefs: Pick<TelegramPreferences, "chartPhotoOnOpen" | "chartPhotoOnClose">,
) {
  return keys.filter((key) => {
    if (key.startsWith("new-trade:")) return prefs.chartPhotoOnOpen
    if (key.startsWith("trade-closed:")) return prefs.chartPhotoOnClose
    return false
  })
}
