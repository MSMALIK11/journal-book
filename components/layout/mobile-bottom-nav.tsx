"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Calendar, Radio, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

type TabKey = "analytics" | "calendar" | "live-sync" | "settings"

type NavItem = {
  key: TabKey
  name: string
  href: string
  icon: typeof Radio
  match: (pathname: string) => boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    key: "analytics",
    name: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    match: (pathname) => pathname === "/analytics" || pathname.startsWith("/analytics/"),
  },
  {
    key: "calendar",
    name: "Calendar",
    href: "/calendar",
    icon: Calendar,
    match: (pathname) => pathname === "/calendar" || pathname.startsWith("/calendar/"),
  },
  {
    key: "live-sync",
    name: "Live Sync",
    href: "/live-sync",
    icon: Radio,
    match: (pathname) => pathname === "/live-sync" || pathname.startsWith("/live-sync/"),
  },
  {
    key: "settings",
    name: "Settings",
    href: "/settings",
    icon: Settings,
    match: (pathname) => pathname === "/settings" || pathname.startsWith("/settings/"),
  },
]

const VIEWBOX_W = 520
const VIEWBOX_H = 110
const COIN_SIZE = 56
const COIN_OFFSET = COIN_SIZE / 2
const COIN_EASE = "cubic-bezier(0.2, 0.9, 0.3, 1.25)"
const COIN_MS = 450

function activeKey(pathname: string): TabKey | null {
  return NAV_ITEMS.find((item) => item.match(pathname))?.key ?? null
}

/** Rounded bar + smooth scoop cutout — same math as reference HTML. */
function generatePath(cx: number) {
  const W = VIEWBOX_W
  const H = VIEWBOX_H - 5
  const topY = 30
  const R = 35

  const startX = cx - 45
  const midLeftX = cx - 25
  const bottomY = topY + 28
  const midRightX = cx + 25
  const endX = cx + 45

  return `
    M ${R},${topY}
    L ${startX},${topY}
    C ${midLeftX},${topY} ${cx - 20},${bottomY} ${cx},${bottomY}
    C ${cx + 20},${bottomY} ${midRightX},${topY} ${endX},${topY}
    L ${W - R},${topY}
    A ${R},${R} 0 0 1 ${W},${topY + R}
    L ${W},${H - R}
    A ${R},${R} 0 0 1 ${W - R},${H}
    L ${R},${H}
    A ${R},${R} 0 0 1 0,${H - R}
    L 0,${topY + R}
    A ${R},${R} 0 0 1 ${R},${topY}
    Z
  `
}

function flatPath() {
  const W = VIEWBOX_W
  const H = VIEWBOX_H - 5
  const topY = 30
  const R = 35

  return `
    M ${R},${topY}
    L ${W - R},${topY}
    A ${R},${R} 0 0 1 ${W},${topY + R}
    L ${W},${H - R}
    A ${R},${R} 0 0 1 ${W - R},${H}
    L ${R},${H}
    A ${R},${R} 0 0 1 0,${H - R}
    L 0,${topY + R}
    A ${R},${R} 0 0 1 ${R},${topY}
    Z
  `
}

function BottomNavBar({ pathname }: { pathname: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Partial<Record<TabKey, HTMLAnchorElement | null>>>({})
  const cutoutCenter = useRef(VIEWBOX_W / 2)
  const cutoutRaf = useRef<number | null>(null)

  const [pathD, setPathD] = useState(() => generatePath(VIEWBOX_W / 2))
  const [coinX, setCoinX] = useState(0)
  const [ready, setReady] = useState(false)

  const currentKey = activeKey(pathname)
  const activeItem = NAV_ITEMS.find((item) => item.key === currentKey)
  const ActiveIcon = activeItem?.icon

  const animateCutout = useCallback((targetX: number) => {
    if (cutoutRaf.current) cancelAnimationFrame(cutoutRaf.current)

    const step = () => {
      const diff = targetX - cutoutCenter.current
      if (Math.abs(diff) > 0.4) {
        cutoutCenter.current += diff * 0.16
        setPathD(generatePath(cutoutCenter.current))
        cutoutRaf.current = requestAnimationFrame(step)
      } else {
        cutoutCenter.current = targetX
        setPathD(generatePath(targetX))
      }
    }

    step()
  }, [])

  const syncActivePosition = useCallback(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || !currentKey) {
      setReady(false)
      setPathD(flatPath())
      return
    }

    const item = itemRefs.current[currentKey]
    if (!item) return

    const parentRect = wrapper.getBoundingClientRect()
    const rect = item.getBoundingClientRect()
    const scale = VIEWBOX_W / parentRect.width
    const targetCenter = (rect.left - parentRect.left + rect.width / 2) * scale
    const nextCoinX = rect.left - parentRect.left + rect.width / 2 - COIN_OFFSET

    setCoinX(nextCoinX)
    animateCutout(targetCenter)
    setReady(true)
  }, [animateCutout, currentKey])

  useLayoutEffect(() => {
    syncActivePosition()
  }, [syncActivePosition, pathname])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const observer = new ResizeObserver(() => syncActivePosition())
    observer.observe(wrapper)
    window.addEventListener("resize", syncActivePosition)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncActivePosition)
      if (cutoutRaf.current) cancelAnimationFrame(cutoutRaf.current)
    }
  }, [syncActivePosition])

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[100] max-lg:block lg:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto max-w-lg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div ref={wrapperRef} className="relative h-20 w-full">
          <svg
            className="pointer-events-none absolute -top-[30px] left-0 z-[1] h-[110px] w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.08)] dark:drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d={pathD}
              className="fill-card stroke-border/60 dark:fill-[#0d141c] dark:stroke-cyan-400/15"
              strokeWidth={1}
            />
          </svg>

          {ready && ActiveIcon ? (
            <div
              className="pointer-events-none absolute -top-6 z-10 flex items-center justify-center rounded-full border border-border/70 bg-card shadow-[0_8px_18px_rgba(0,0,0,0.12)] dark:border-cyan-400/25 dark:bg-[#0d141c] dark:shadow-[0_0_22px_rgba(34,211,238,0.22)]"
              style={{
                width: COIN_SIZE,
                height: COIN_SIZE,
                transform: `translateX(${coinX}px)`,
                transition: `transform ${COIN_MS}ms ${COIN_EASE}`,
              }}
              aria-hidden
            >
              <ActiveIcon
                className="h-6 w-6 text-primary dark:text-cyan-400"
                strokeWidth={2.25}
              />
            </div>
          ) : null}

          <ul className="relative z-[12] flex h-[75px] w-full list-none">
            {NAV_ITEMS.map((item) => {
              const active = currentKey === item.key
              const Icon = item.icon

              return (
                <li key={item.key} className="h-full flex-1">
                  <Link
                    ref={(el) => {
                      itemRefs.current[item.key] = el
                    }}
                    href={item.href}
                    prefetch
                    aria-label={item.name}
                    aria-current={active ? "page" : undefined}
                    className="flex h-full cursor-pointer flex-col items-center justify-center select-none"
                  >
                    <div
                      className={cn(
                        "flex h-[30px] w-[30px] items-center justify-center transition-all duration-300",
                        active && "opacity-0 -translate-y-2.5",
                      )}
                    >
                      <Icon
                        className="h-[26px] w-[26px] text-muted-foreground"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </div>
                    <span
                      className={cn(
                        "mt-1 max-w-[4.75rem] truncate text-[13px] leading-none transition-colors duration-300",
                        active
                          ? "font-bold text-primary dark:text-cyan-400"
                          : "font-semibold text-muted-foreground",
                      )}
                    >
                      {item.name}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </nav>
  )
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(<BottomNavBar pathname={pathname} />, document.body)
}
