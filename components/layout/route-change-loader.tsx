"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { NeonPulseLoader } from "@/components/ui/neon-pulse-loader"

/** Fast navigations should show nothing at all — only reveal the loader if the route stalls. */
const SHOW_DELAY_MS = 450
/** Once visible, keep it long enough to avoid a jarring flicker. */
const MIN_VISIBLE_MS = 250
const MAX_VISIBLE_MS = 8000

function isInternalNavigationLink(anchor: HTMLAnchorElement, pathname: string) {
  const href = anchor.getAttribute("href")
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false
  }
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return false
  if (anchor.getAttribute("rel")?.includes("external")) return false

  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) return false
    return url.pathname !== pathname || url.search !== window.location.search
  } catch {
    return false
  }
}

export function RouteChangeLoader() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const shownAtRef = useRef(0)
  const navPendingRef = useRef(false)

  function clearTimer(ref: { current: number | null }) {
    if (ref.current != null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }

  function reset() {
    navPendingRef.current = false
    clearTimer(showTimerRef)
    clearTimer(hideTimerRef)
    clearTimer(maxTimerRef)
  }

  function startNavigation() {
    reset()
    navPendingRef.current = true

    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null
      if (!navPendingRef.current) return
      shownAtRef.current = Date.now()
      setVisible(true)
      maxTimerRef.current = window.setTimeout(() => {
        maxTimerRef.current = null
        navPendingRef.current = false
        setVisible(false)
      }, MAX_VISIBLE_MS)
    }, SHOW_DELAY_MS)
  }

  function finishNavigation() {
    const wasShown = showTimerRef.current == null && navPendingRef.current
    reset()

    if (!wasShown) {
      setVisible(false)
      return
    }

    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAtRef.current))
    if (remaining === 0) {
      setVisible(false)
      return
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      setVisible(false)
    }, remaining)
  }

  useEffect(() => {
    if (!navPendingRef.current) return
    finishNavigation()
  }, [pathname])

  useEffect(() => {
    // `defaultPrevented` is not a bail-out: next/link always calls preventDefault()
    // before starting a client-side navigation.
    function onDocumentClick(event: MouseEvent) {
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as Element | null)?.closest("a")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (!isInternalNavigationLink(anchor, pathname)) return

      startNavigation()
    }

    document.addEventListener("click", onDocumentClick)
    window.addEventListener("popstate", startNavigation)
    return () => {
      document.removeEventListener("click", onDocumentClick)
      window.removeEventListener("popstate", startNavigation)
    }
  }, [pathname])

  useEffect(() => () => reset(), [])

  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-[#06080c]/90"
      aria-busy="true"
      aria-live="polite"
    >
      <NeonPulseLoader status="CONNECTING..." className="scale-125" />
    </div>
  )
}
