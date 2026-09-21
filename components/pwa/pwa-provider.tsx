"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { isStandalonePwa, refreshSessionCookie, registerServiceWorker } from "@/lib/pwa/client"

const PUBLIC_ROUTES = new Set(["/", "/landing-page", "/login", "/register"])

/** Register SW, keep sessions alive in standalone PWA, refresh cookie on focus. */
export function PwaProvider() {
  const pathname = usePathname()

  useEffect(() => {
    void registerServiceWorker()
  }, [])

  useEffect(() => {
    if (PUBLIC_ROUTES.has(pathname)) return

    let cancelled = false

    async function keepAlive() {
      if (cancelled) return
      await refreshSessionCookie()
    }

    void keepAlive()

    const onVisible = () => {
      if (document.visibilityState === "visible") void keepAlive()
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void keepAlive()
    }, 12 * 60 * 60 * 1000)

    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)

    if (isStandalonePwa()) {
      document.documentElement.classList.add("jb-standalone")
    }

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [pathname])

  return null
}
