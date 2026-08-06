"use client"

import { useEffect, useState } from "react"
import { BellRing, Play, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  SettingsHint,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-section"
import { authFetch } from "@/lib/client-auth"
import {
  DEFAULT_TRADE_ALARM_PREFERENCES,
  TRADE_ALARM_SOUNDS,
  normalizeTradeAlarmPreferences,
  type TradeAlarmPreferences,
  type TradeAlarmSoundId,
  type TradeAlarmSoundMode,
} from "@/lib/new-trade-alarm-settings"
import { playTradeAlarmSound, stopTradeAlarmSound } from "@/lib/trade-alarm-sound"
import { useToast } from "@/hooks/use-toast"
import { refreshTradeAlarmPreferences } from "@/components/notifications/new-trade-alarm-provider"
import { cn } from "@/lib/utils"

const SOUND_MODE_OPTIONS: Array<{
  value: TradeAlarmSoundMode
  title: string
  description: string
}> = [
  {
    value: "once",
    title: "Play once",
    description: "One play when a new trade arrives. Modal still opens.",
  },
  {
    value: "manual",
    title: "Repeat until I stop",
    description: "Keeps playing until you tap Stop alert on the modal.",
  },
]

export function TradeAlarmSettings() {
  const { toast } = useToast()
  const [preferences, setPreferences] = useState<TradeAlarmPreferences>(DEFAULT_TRADE_ALARM_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  function stopTestSound() {
    stopTradeAlarmSound()
    setTesting(false)
  }

  useEffect(() => () => stopTradeAlarmSound(), [])

  function testSound(mode: TradeAlarmSoundMode = preferences.soundMode) {
    stopTestSound()
    setTesting(true)
    playTradeAlarmSound(preferences.soundId, mode)
    if (mode === "once") {
      window.setTimeout(() => setTesting(false), 3000)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const response = await authFetch("/api/settings/trade-alarm")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to load preferences")
        setPreferences(normalizeTradeAlarmPreferences(data.preferences))
      } catch (error) {
        toast({
          title: "Could not load trade alarm settings",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  async function savePreferences(next: TradeAlarmPreferences, key: string) {
    const normalized = normalizeTradeAlarmPreferences(next)
    const previous = preferences
    setPreferences(normalized)
    setSavingKey(key)

    try {
      const response = await authFetch("/api/settings/trade-alarm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save")
      setPreferences(normalizeTradeAlarmPreferences(data.preferences))
      await refreshTradeAlarmPreferences()
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
    <SettingsSection
      id="trade-alarm"
      icon={BellRing}
      iconTone="rose"
      title="New trade alarm"
      description="Sound + modal when Live Sync imports a brand-new trade — not on updates."
      defaultOpen
      badge={
        !loading ? (
          <Badge
            variant="outline"
            className={
              preferences.enabled
                ? "text-[10px] font-normal border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "text-[10px] font-normal"
            }
          >
            {preferences.enabled ? "On" : "Off"}
          </Badge>
        ) : null
      }
    >
      <div className="space-y-4">
        <SettingsRow
          label="Enable new trade alarm"
          description="Fires when a new open trade is imported from TradingView — not when a trade closes."
          htmlFor="trade-alarm-enabled"
        >
          <Switch
            id="trade-alarm-enabled"
            checked={preferences.enabled}
            disabled={loading || savingKey === "enabled"}
            onCheckedChange={(checked) =>
              void savePreferences({ ...preferences, enabled: checked }, "enabled")
            }
          />
        </SettingsRow>

        <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-medium">Alarm sound</Label>
            {testing && preferences.soundMode === "manual" ? (
              <Button type="button" size="sm" variant="destructive" className="h-8 gap-1.5" onClick={stopTestSound}>
                <Square className="h-3.5 w-3.5" />
                Stop test
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2">
            {TRADE_ALARM_SOUNDS.map((sound) => {
              const selected = preferences.soundId === sound.id

              return (
                <div
                  key={sound.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/60 bg-background/80",
                    (loading || !preferences.enabled) && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    disabled={loading || !preferences.enabled || savingKey === "soundId"}
                    onClick={() =>
                      void savePreferences({ ...preferences, soundId: sound.id as TradeAlarmSoundId }, "soundId")
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected ? "border-primary bg-primary" : "border-muted-foreground/40",
                        )}
                      >
                        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{sound.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{sound.description}</p>
                      </div>
                    </div>
                  </button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3 h-8 w-full gap-1.5"
                    disabled={loading}
                    onClick={() => {
                      if (!selected) {
                        void savePreferences({ ...preferences, soundId: sound.id }, "soundId")
                      }
                      testSound()
                    }}
                  >
                    <Play className={cn("h-3.5 w-3.5", testing && selected && "animate-pulse")} />
                    {testing && selected ? "Playing…" : "Test play"}
                  </Button>
                </div>
              )
            })}
          </div>

          <SettingsHint>
            Sounds from{" "}
            <a
              href="https://mixkit.co/free-sound-effects/alarm/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Mixkit
            </a>{" "}
            (free license). Select a sound, then test with your behavior mode below.
          </SettingsHint>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3.5 space-y-3">
          <Label className="text-sm font-medium">When a new trade arrives</Label>

          <div className="grid gap-2 sm:grid-cols-2">
            {SOUND_MODE_OPTIONS.map((option) => {
              const selected = preferences.soundMode === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={loading || !preferences.enabled || savingKey === "soundMode"}
                  onClick={() => void savePreferences({ ...preferences, soundMode: option.value }, "soundMode")}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/60 bg-background/80 hover:bg-muted/20",
                    (loading || !preferences.enabled) && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-primary bg-primary" : "border-muted-foreground/40",
                      )}
                    >
                      {selected ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : null}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{option.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{option.description}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full gap-1.5"
            disabled={loading || testing}
            onClick={() => testSound(preferences.soundMode)}
          >
            <Play className="h-4 w-4" />
            Test with current settings
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
