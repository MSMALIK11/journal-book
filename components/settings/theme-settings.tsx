"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section"

export function ThemeSettings() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"
  const sectionIcon = !mounted ? Sun : isDark ? Moon : Sun

  return (
    <SettingsSection
      id="appearance"
      icon={sectionIcon}
      iconTone="violet"
      title="Appearance"
      description="Switch between light and dark mode for the journal UI."
      badge={
        mounted ? (
          <Badge variant="outline" className="text-[10px] font-normal capitalize">
            {isDark ? "Dark" : "Light"}
          </Badge>
        ) : null
      }
    >
      <SettingsRow
        label="Color theme"
        description="Applies across dashboard, live sync, analytics, and settings."
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant={mounted && !isDark ? "default" : "outline"}
            disabled={!mounted}
            onClick={() => setTheme("light")}
          >
            <Sun className="mr-2 h-4 w-4" />
            Light
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mounted && isDark ? "default" : "outline"}
            disabled={!mounted}
            onClick={() => setTheme("dark")}
          >
            <Moon className="mr-2 h-4 w-4" />
            Dark
          </Button>
        </div>
      </SettingsRow>
    </SettingsSection>
  )
}
