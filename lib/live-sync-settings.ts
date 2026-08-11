const LIVE_SYNC_POLL_SECONDS_KEY = "jb-live-sync-poll-seconds"

export const DEFAULT_LIVE_SYNC_POLL_SECONDS = 5

export const LIVE_SYNC_POLL_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 5, label: "Every 5 seconds (recommended)" },
  { value: 15, label: "Every 15 seconds" },
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every 1 minute" },
  { value: 120, label: "Every 2 minutes" },
  { value: 300, label: "Every 5 minutes" },
  { value: 600, label: "Every 10 minutes" },
  { value: 900, label: "Every 15 minutes" },
  { value: 1800, label: "Every 30 minutes" },
] as const

export function getLiveSyncPollSeconds() {
  if (typeof window === "undefined") return DEFAULT_LIVE_SYNC_POLL_SECONDS
  const stored = window.localStorage.getItem(LIVE_SYNC_POLL_SECONDS_KEY)
  if (stored === null) return DEFAULT_LIVE_SYNC_POLL_SECONDS
  const seconds = Number.parseInt(stored, 10)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_LIVE_SYNC_POLL_SECONDS
}

export function setLiveSyncPollSeconds(seconds: number) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LIVE_SYNC_POLL_SECONDS_KEY, String(Math.max(0, seconds)))
  window.dispatchEvent(new Event("jb-live-sync-settings-changed"))
}

export function formatLiveSyncPollLabel(seconds: number) {
  const match = LIVE_SYNC_POLL_OPTIONS.find((option) => option.value === seconds)
  if (match) return match.label
  if (seconds <= 0) return "Off"
  if (seconds < 60) return `Every ${seconds} seconds`
  if (seconds % 60 === 0) return `Every ${seconds / 60} minute${seconds === 60 ? "" : "s"}`
  return `Every ${seconds} seconds`
}
