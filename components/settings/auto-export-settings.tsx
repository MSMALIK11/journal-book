"use client"

import { useEffect, useState } from "react"
import { Download, FolderOutput } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-section"
import { authFetch } from "@/lib/client-auth"
import {
  AUTO_EXPORT_TIME_OPTIONS,
  DEFAULT_AUTO_EXPORT_PREFERENCES,
  normalizeAutoExportPreferences,
  type AutoExportPreferences,
} from "@/lib/auto-export-settings"
import { useToast } from "@/hooks/use-toast"
import { format, parseISO } from "date-fns"

export function AutoExportSettings() {
  const { toast } = useToast()
  const [preferences, setPreferences] = useState<AutoExportPreferences>(DEFAULT_AUTO_EXPORT_PREFERENCES)
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [exportingDaily, setExportingDaily] = useState(false)
  const [exportingMonthly, setExportingMonthly] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const response = await authFetch("/api/settings/auto-export")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to load settings")
        setPreferences(normalizeAutoExportPreferences(data.preferences))
        setTimezone(data.timezone || "Asia/Kolkata")
      } catch (error) {
        toast({
          title: "Could not load auto-export settings",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  async function savePreferences(next: AutoExportPreferences, key: string) {
    const normalized = normalizeAutoExportPreferences(next)
    const previous = preferences
    setPreferences(normalized)
    setSavingKey(key)

    try {
      const response = await authFetch("/api/settings/auto-export", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: normalized.enabled,
          monthlyEnabled: normalized.monthlyEnabled,
          time: normalized.time,
          folderName: normalized.folderName,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save")
      setPreferences(normalizeAutoExportPreferences(data.preferences))
      setTimezone(data.timezone || timezone)
    } catch (error) {
      setPreferences(previous)
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSavingKey(null)
    }
  }

  async function refreshPrefs() {
    const prefsResponse = await authFetch("/api/settings/auto-export")
    const prefsData = await prefsResponse.json()
    if (prefsResponse.ok) {
      setPreferences(normalizeAutoExportPreferences(prefsData.preferences))
    }
  }

  async function runDailyExportNow(force = true) {
    setExportingDaily(true)
    try {
      const response = await authFetch("/api/export/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Export failed")

      await refreshPrefs()

      toast({
        title: data.skipped ? "Already exported today" : "Saved to TradingJournal",
        description: data.absolutePath || data.message || data.path || `${data.count ?? 0} trade(s)`,
      })
    } catch (error) {
      toast({
        title: "Daily export failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setExportingDaily(false)
    }
  }

  async function runMonthlyExportNow(force = true) {
    setExportingMonthly(true)
    try {
      const response = await authFetch("/api/export/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Export failed")

      await refreshPrefs()

      toast({
        title: data.skipped ? "Monthly export skipped" : "Saved to TradingJournal",
        description: data.absolutePath || data.message || data.path || `${data.count ?? 0} trade(s)`,
      })
    } catch (error) {
      toast({
        title: "Monthly export failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setExportingMonthly(false)
    }
  }

  const lastExportLabel = preferences.lastExportAt
    ? format(parseISO(preferences.lastExportAt), "MMM d, HH:mm")
    : null
  const lastMonthlyLabel = preferences.lastMonthlyExportAt
    ? format(parseISO(preferences.lastMonthlyExportAt), "MMM d, HH:mm")
    : null

  const scheduleBadge =
    preferences.enabled || preferences.monthlyEnabled
      ? preferences.enabled && preferences.monthlyEnabled
        ? "Daily + Monthly"
        : preferences.enabled
          ? "Daily"
          : "Monthly"
      : "Off"

  return (
    <SettingsSection
      id="auto-export"
      icon={FolderOutput}
      iconTone="emerald"
      title="Auto-export"
      description="Save TradingView trades into a folder in your home directory — daily and/or at month end."
      badge={
        !loading ? (
          <Badge
            variant="outline"
            className={
              preferences.enabled || preferences.monthlyEnabled
                ? "text-[10px] font-normal border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "text-[10px] font-normal"
            }
          >
            {scheduleBadge}
          </Badge>
        ) : null
      }
    >
      <div className="space-y-4">
        <SettingsRow
          label="Enable daily export"
          description={`Runs at ${preferences.time} in your timezone (${timezone.replace(/_/g, " ")}).`}
          htmlFor="auto-export-enabled"
        >
          <Switch
            id="auto-export-enabled"
            checked={preferences.enabled}
            disabled={loading || savingKey === "enabled"}
            onCheckedChange={(checked) =>
              void savePreferences({ ...preferences, enabled: checked }, "enabled")
            }
          />
        </SettingsRow>

        <SettingsRow
          label="Enable monthly export"
          description={`On the last day of the month at ${preferences.time}, exports the full current month.`}
          htmlFor="auto-export-monthly-enabled"
        >
          <Switch
            id="auto-export-monthly-enabled"
            checked={preferences.monthlyEnabled}
            disabled={loading || savingKey === "monthlyEnabled"}
            onCheckedChange={(checked) =>
              void savePreferences({ ...preferences, monthlyEnabled: checked }, "monthlyEnabled")
            }
          />
        </SettingsRow>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3.5 space-y-2">
            <Label htmlFor="auto-export-time" className="text-sm font-medium">
              Export time
            </Label>
            <Select
              value={preferences.time}
              disabled={loading || savingKey === "time"}
              onValueChange={(value) => void savePreferences({ ...preferences, time: value }, "time")}
            >
              <SelectTrigger id="auto-export-time" className="w-full bg-background">
                <SelectValue placeholder="Pick time" />
              </SelectTrigger>
              <SelectContent>
                {AUTO_EXPORT_TIME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3.5 space-y-2">
            <Label htmlFor="auto-export-folder" className="text-sm font-medium">
              Subfolder name
            </Label>
            <Input
              id="auto-export-folder"
              value={preferences.folderName}
              disabled={loading || savingKey === "folderName"}
              onChange={(event) =>
                setPreferences({ ...preferences, folderName: event.target.value })
              }
              onBlur={() =>
                void savePreferences({ ...preferences, folderName: preferences.folderName }, "folderName")
              }
            />
          </div>
        </div>

        {preferences.lastExportPath ? (
          <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3 text-sm">
            <p className="font-medium">Last daily export</p>
            <p className="mt-1 text-muted-foreground text-xs break-all">{preferences.lastExportPath}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {preferences.lastExportCount ?? 0} trade(s)
              {lastExportLabel ? ` · ${lastExportLabel}` : ""}
            </p>
            {preferences.lastExportDayKey ? (
              <Button asChild variant="link" className="h-auto p-0 mt-2 text-xs">
                <a href={`/api/export/daily?day=${preferences.lastExportDayKey}`}>
                  Download a copy to computer
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {preferences.lastMonthlyExportPath ? (
          <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3 text-sm">
            <p className="font-medium">Last monthly export</p>
            <p className="mt-1 text-muted-foreground text-xs break-all">
              {preferences.lastMonthlyExportPath}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {preferences.lastMonthlyExportCount ?? 0} trade(s)
              {lastMonthlyLabel ? ` · ${lastMonthlyLabel}` : ""}
            </p>
            {preferences.lastMonthlyExportMonthKey ? (
              <Button asChild variant="link" className="h-auto p-0 mt-2 text-xs">
                <a href={`/api/export/monthly?month=${preferences.lastMonthlyExportMonthKey}`}>
                  Download a copy to computer
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="gap-1.5"
            disabled={loading || exportingDaily}
            onClick={() => void runDailyExportNow(true)}
          >
            <Download className="h-4 w-4" />
            {exportingDaily ? "Saving…" : "Save today to server folder"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-1.5"
            disabled={loading || exportingMonthly}
            onClick={() => void runMonthlyExportNow(true)}
          >
            <Download className="h-4 w-4" />
            {exportingMonthly ? "Saving…" : "Save this month to server folder"}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
