"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { authFetch } from "@/lib/client-auth"
import { DEFAULT_ALERT_PREFERENCES, type AlertPreferences } from "@/lib/trading/alerts"
import { useToast } from "@/hooks/use-toast"

const PREFERENCE_ITEMS: Array<{ key: keyof AlertPreferences; label: string; description: string }> = [
  {
    key: "dailyDigest",
    label: "Daily brief",
    description: "One short summary each morning for the active account.",
  },
  {
    key: "weakHours",
    label: "Hour alerts",
    description: "Flag when the current hour is weak or strong in your history.",
  },
  {
    key: "weakDays",
    label: "Weekday alerts",
    description: "Flag when today’s weekday tends to be weak or strong.",
  },
  {
    key: "weakSessions",
    label: "Session alerts",
    description: "Flag the active session window (Pre Asia, London Open, NY Open, etc.).",
  },
  {
    key: "edgeAlerts",
    label: "Strong window alerts",
    description: "Notify when hour, day, or session stats look strong.",
  },
  {
    key: "seasonAlerts",
    label: "Month alerts",
    description: "Flag when this month has been weak in your data.",
  },
  {
    key: "instrumentSession",
    label: "Symbol × session",
    description: "Alerts for a specific instrument in the current session.",
  },
  {
    key: "streakWarnings",
    label: "Loss streak",
    description: "Reminder after 3 losses in a row.",
  },
  {
    key: "todaySummary",
    label: "Today's performance",
    description: "Compare today's win rate against your account baseline.",
  },
  {
    key: "behaviorAlerts",
    label: "Behavior alerts",
    description: "Tilt after a loss, overtrading, and recovery-mode warnings.",
  },
  {
    key: "researchAlerts",
    label: "Research edge & leaks",
    description: "Live alerts when the current moment matches a known edge or leak.",
  },
  {
    key: "deadZoneAlerts",
    label: "Dead Zone alerts",
    description: "Flag when the low-activity Dead Zone window is active.",
  },
  {
    key: "overlapAlerts",
    label: "Overlap window alerts",
    description: "Stats for the London + NY overlap period (18:30–21:30).",
  },
  {
    key: "keySessionAlerts",
    label: "Key session nudges",
    description: "Strong-window reminders for London Open, NY Open, and similar tiers.",
  },
]

export function AlertSettings() {
  const { toast } = useToast()
  const [preferences, setPreferences] = useState<AlertPreferences>(DEFAULT_ALERT_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const response = await authFetch("/api/alerts/preferences")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to load preferences")
        setPreferences({ ...DEFAULT_ALERT_PREFERENCES, ...data.preferences })
      } catch (error) {
        toast({
          title: "Could not load alert settings",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  async function updatePreference(key: keyof AlertPreferences, value: boolean) {
    const previous = preferences
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    setSavingKey(key)

    try {
      const response = await authFetch("/api/alerts/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save")
      setPreferences({ ...DEFAULT_ALERT_PREFERENCES, ...data.preferences })
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alert preferences</CardTitle>
        <CardDescription>
          Control which data-backed alerts appear in the bell icon for your active account. Alerts use
          the same analysis as Research and Analytics.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">How alerts work</p>
          <p className="text-xs text-muted-foreground">
            Based on your trade history — each account has its own stats.
          </p>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500 shrink-0" />
              <span>
                <strong>Weak</strong> — low win rate or losing in that time bucket
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
              <span>
                <strong>Average</strong> — win rate is okay but below your usual edge
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
              <span>
                <strong>Strong</strong> — 50%+ win rate with positive results
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        ) : (
          PREFERENCE_ITEMS.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor={`alert-${item.key}`}>{item.label}</Label>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Switch
                id={`alert-${item.key}`}
                checked={preferences[item.key]}
                disabled={savingKey === item.key}
                onCheckedChange={(checked) => void updatePreference(item.key, checked)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
