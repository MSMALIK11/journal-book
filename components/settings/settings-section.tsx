"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown, type LucideIcon } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

type SettingsSectionProps = {
  id: string
  icon: LucideIcon
  title: string
  description: string
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  iconTone?: "blue" | "amber" | "emerald" | "violet" | "rose"
}

const ICON_TONES: Record<NonNullable<SettingsSectionProps["iconTone"]>, string> = {
  blue: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
}

export function SettingsSection({
  icon: Icon,
  title,
  description,
  badge,
  defaultOpen = false,
  children,
  iconTone = "blue",
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="hud-panel overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-cyan-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          >
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                ICON_TONES[iconTone],
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
                {badge}
              </div>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>

            <ChevronDown
              className={cn(
                "mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-200">
          <div className="border-t border-cyan-400/10 px-5 pb-5 pt-4">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

type SettingsRowProps = {
  label: string
  description?: string
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function SettingsRow({ label, description, htmlFor, children, className }: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border border-cyan-400/15 bg-[#05070a]/50 px-4 py-3.5 transition-colors hover:bg-cyan-400/5",
        className,
      )}
    >
      <div className="min-w-0 space-y-1 pr-2">
        <label htmlFor={htmlFor} className="text-sm font-medium leading-none cursor-pointer">
          {label}
        </label>
        {description ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="hud-label px-0.5">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

export function SettingsHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
      {children}
    </div>
  )
}
