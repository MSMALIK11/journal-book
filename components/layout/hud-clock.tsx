"use client"

import { useEffect, useState } from "react"

export function HudClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!now) {
    return <div className="h-4 w-24" />
  }

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now)

  return (
    <div className="hidden font-mono text-xs tabular-nums text-cyan-200/85 sm:block">
      {time}
      <span className="ml-1 text-muted-foreground">IST</span>
    </div>
  )
}
