"use client"

import { useEffect, useRef, type RefObject } from "react"

type Options = {
  enabled?: boolean
  onRefresh: () => void | Promise<void>
  threshold?: number
}

/** Lightweight pull-to-refresh for mobile — only fires when scrolled to top. */
export function usePullToRefresh(
  containerRef: RefObject<HTMLElement | null>,
  { enabled = true, onRefresh, threshold = 72 }: Options,
) {
  const startY = useRef(0)
  const pulling = useRef(false)
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !enabled) return

    function onTouchStart(event: TouchEvent) {
      if (el!.scrollTop > 0) return
      startY.current = event.touches[0]?.clientY ?? 0
      pulling.current = true
    }

    function onTouchMove(event: TouchEvent) {
      if (!pulling.current || el!.scrollTop > 0) return
      const delta = (event.touches[0]?.clientY ?? 0) - startY.current
      if (delta > threshold + 20) event.preventDefault()
    }

    async function onTouchEnd(event: TouchEvent) {
      if (!pulling.current) return
      pulling.current = false
      if (el!.scrollTop > 0) return
      const delta = (event.changedTouches[0]?.clientY ?? 0) - startY.current
      if (delta >= threshold) {
        await onRefreshRef.current()
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
    }
  }, [containerRef, enabled, threshold])
}
