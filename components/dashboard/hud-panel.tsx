import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Glow = "cyan" | "green" | "red" | "none"

export function HudPanel({
  className,
  glow = "cyan",
  children,
}: {
  className?: string
  glow?: Glow
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "hud-panel overflow-hidden",
        glow === "green" && "border-emerald-400/25",
        glow === "red" && "border-rose-400/25",
        glow === "none" && "border-border/70",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function HudPanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-cyan-400/10 px-5 py-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
