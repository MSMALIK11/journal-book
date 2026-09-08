"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/** Instant routes should show nothing at all — only reveal the bar if the route takes a moment. */
const SHOW_DELAY_MS = 150
/** Ease toward this while the route is still pending; only completion reaches 100. */
const TRICKLE_CEILING = 90
const TRICKLE_MS = 200
/** Keep the finished bar on screen briefly so it reads as "done" rather than vanishing. */
const FINISH_LINGER_MS = 220
const MAX_VISIBLE_MS = 15000

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

/**
 * A slim top progress bar, deliberately not a full-screen overlay: the sidebar, header and each
 * route's own `loading.tsx` skeleton stay visible, so a navigation reads as instant even when the
 * server payload takes a moment.
 */
export function RouteChangeLoader() {
  const pathname = usePathname()
  const [progress, setProgress] = useState<number | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const trickleTimerRef = useRef<number | null>(null)
  const finishTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const navPendingRef = useRef(false)
  const shownRef = useRef(false)

  function clearTimer(ref: { current: number | null }) {
    if (ref.current != null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }

  function stopTrickle() {
    if (trickleTimerRef.current != null) {
      window.clearInterval(trickleTimerRef.current)
      trickleTimerRef.current = null
    }
  }

  function reset() {
    navPendingRef.current = false
    shownRef.current = false
    clearTimer(showTimerRef)
    clearTimer(finishTimerRef)
    clearTimer(maxTimerRef)
    stopTrickle()
  }

  function startNavigation() {
    // A back-to-back click can land while the previous bar is still lingering at 100%.
    const hadPendingFinish = finishTimerRef.current != null
    reset()
    if (hadPendingFinish) setProgress(null)
    navPendingRef.current = true

    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null
      if (!navPendingRef.current) return

      shownRef.current = true
      setProgress(8)
      trickleTimerRef.current = window.setInterval(() => {
        setProgress((current) => {
          if (current == null) return current
          return Math.min(TRICKLE_CEILING, current + Math.max(1, (TRICKLE_CEILING - current) * 0.18))
        })
      }, TRICKLE_MS)

      maxTimerRef.current = window.setTimeout(() => {
        maxTimerRef.current = null
        finishNavigation()
      }, MAX_VISIBLE_MS)
    }, SHOW_DELAY_MS)
  }

  function finishNavigation() {
    const wasShown = shownRef.current
    reset()

    if (!wasShown) {
      setProgress(null)
      return
    }

    setProgress(100)
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null
      setProgress(null)
    }, FINISH_LINGER_MS)
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

  if (progress == null) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 bg-transparent"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className="h-full bg-gradient-to-r from-cyan-500 via-cyan-300 to-violet-400 shadow-[0_0_10px_rgba(34,211,238,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
