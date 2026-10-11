"use client"

/** Best-effort PWA home-screen badge — silently no-ops when unsupported. */
export function setPwaAppBadge(count: number) {
  if (typeof navigator === "undefined") return
  const nav = navigator as Navigator & {
    setAppBadge?: (count: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  if (count > 0 && typeof nav.setAppBadge === "function") {
    void nav.setAppBadge(count).catch(() => {})
    return
  }
  if (typeof nav.clearAppBadge === "function") {
    void nav.clearAppBadge().catch(() => {})
  }
}
