"use client"

import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  SettingsGroup,
  SettingsHint,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-section"
import { authFetch } from "@/lib/client-auth"
import { DEFAULT_ALERT_PREFERENCES, type AlertPreferences } from "@/lib/trading/alerts"
import { useToast } from "@/hooks/use-toast"

const PREFERENCE_GROUPS: Array<{
  title: string
  items: Array<{ key: keyof AlertPreferences; label: string; description: string }>
}> = [
  {
    title: "Daily & summary",
    items: [
      {
        key: "dailyDigest",
        label: "Daily brief",
        description: "One short summary each morning for the active account.",
      },
      {
        key: "todaySummary",
        label: "Today's performance",
        description: "Compare today's win rate against your account baseline.",
      },
    ],
  },
  {
    title: "Time windows",
    items: [
      {
        key: "weakHours",
        label: "Hour alerts",
        description: "Flag when the current hour is weak or strong in your history.",
      },
      {
        key: "weakDays",
        label: "Weekday alerts",
        description: "Flag when today's weekday tends to be weak or strong.",
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
    ],
  },
  {
    title: "Behavior & research",
    items: [
      {
        key: "streakWarnings",
        label: "Loss streak",
        description: "Reminder after 3 losses in a row.",
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
    ],
  },
  {
    title: "Advanced insights",
    items: [
      {
        key: "avoidanceAlerts",
        label: "What-if avoidance",
        description: "Show how much skipping weak windows could've saved historically.",
      },
      {
        key: "drawdownAlerts",
        label: "Drawdown warnings",
        description: "Alert when current drawdown approaches your historical max.",
      },
      {
        key: "weeklyMomentumAlerts",
        label: "Weekly momentum",
        description: "Compare this week vs last week for win rate and P&L shifts.",
      },
      {
        key: "sessionBoundaryAlerts",
        label: "Session open alerts",
        description: "Nudge when a new session window opens with your stats.",
      },
    ],
  },
  {
    title: "Session windows",
    items: [
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
    ],
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

  const enabledCount = Object.values(preferences).filter(Boolean).length

  return (
    <SettingsSection
      id="alerts"
      icon={Bell}
      iconTone="amber"
      title="Alert preferences"
      description="Data-backed alerts in the bell icon — same analysis as Research and Analytics."
      badge={
        !loading ? (
          <Badge variant="outline" className="text-[10px] font-normal">
            {enabledCount} on
          </Badge>
        ) : null
      }
    >
      <div className="space-y-5">
        <SettingsHint>
          <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
              <span>
                <strong className="text-foreground">Weak</strong> — low WR or losing
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
              <span>
                <strong className="text-foreground">Average</strong> — below edge
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span>
                <strong className="text-foreground">Strong</strong> — 50%+ WR
              </span>
            </div>
          </div>
        </SettingsHint>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        ) : (
          PREFERENCE_GROUPS.map((group) => (
            <SettingsGroup key={group.title} title={group.title}>
              {group.items.map((item) => (
                <SettingsRow
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  htmlFor={`alert-${item.key}`}
                >
                  <Switch
                    id={`alert-${item.key}`}
                    checked={preferences[item.key]}
                    disabled={savingKey === item.key}
                    onCheckedChange={(checked) => void updatePreference(item.key, checked)}
                  />
                </SettingsRow>
              ))}
            </SettingsGroup>
          ))
        )}
      </div>
    </SettingsSection>
  )
}
