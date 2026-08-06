export type AutoExportPreferences = {
  enabled: boolean
  /** Month-end export of the full current month (YYYY-MM.csv) */
  monthlyEnabled: boolean
  /** 24h HH:mm in the user's timezone — shared by daily + monthly schedule */
  time: string
  /** Subfolder under ~/TradingJournal/ (default live-sync) */
  folderName: string
  lastExportDayKey?: string
  lastExportAt?: string
  lastExportPath?: string
  lastExportCount?: number
  lastMonthlyExportMonthKey?: string
  lastMonthlyExportAt?: string
  lastMonthlyExportPath?: string
  lastMonthlyExportCount?: number
}

/** Live Sync page exports always go here: ~/TradingJournal/live-sync/ */
export const LIVE_SYNC_EXPORT_FOLDER = "live-sync"

export const DEFAULT_AUTO_EXPORT_PREFERENCES: AutoExportPreferences = {
  enabled: false,
  monthlyEnabled: false,
  time: "23:00",
  folderName: LIVE_SYNC_EXPORT_FOLDER,
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidExportTime(value: string) {
  return TIME_PATTERN.test(value)
}

export function normalizeAutoExportPreferences(
  prefs: Partial<AutoExportPreferences> | null | undefined,
): AutoExportPreferences {
  const merged = { ...DEFAULT_AUTO_EXPORT_PREFERENCES, ...prefs }
  const folderName = (merged.folderName || "live-sync")
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48) || "live-sync"

  return {
    ...merged,
    enabled: Boolean(merged.enabled),
    monthlyEnabled: Boolean(merged.monthlyEnabled),
    time: isValidExportTime(merged.time) ? merged.time : DEFAULT_AUTO_EXPORT_PREFERENCES.time,
    folderName,
  }
}

export const AUTO_EXPORT_TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
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
