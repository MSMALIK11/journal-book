"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Service worker notification taps → in-app navigation without full reload when possible. */
export function PushNavigationSync() {
  const router = useRouter()

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; url?: string }
      if (data?.type !== "jb-push-navigate" || !data.url) return
      router.push(data.url)
    }

    navigator.serviceWorker.addEventListener("message", onMessage)
    return () => navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [router])

  return null
}
