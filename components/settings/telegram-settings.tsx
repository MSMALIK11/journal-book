"use client"

import { useEffect, useState } from "react"
import { BellRing, Plug, Send, Unplug } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section"
import { authFetch } from "@/lib/client-auth"
import {
  DEFAULT_TELEGRAM_PREFERENCES,
  normalizeTelegramPreferences,
  type TelegramPreferences,
} from "@/lib/telegram/settings"
import { useToast } from "@/hooks/use-toast"
import { useActiveAccount } from "@/hooks/use-active-account"

export function TelegramSettings() {
  const { toast } = useToast()
  const { activeAccountId } = useActiveAccount()
  const [preferences, setPreferences] = useState<TelegramPreferences>(DEFAULT_TELEGRAM_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<"detect" | "demo" | null>(null)
  const [destinationConfigured, setDestinationConfigured] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const response = await authFetch("/api/settings/telegram")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to load Telegram settings")
        setPreferences(normalizeTelegramPreferences(data.preferences))
        setDestinationConfigured(Boolean(data.destinationConfigured))
      } catch (error) {
        toast({
          title: "Could not load Telegram",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  async function savePreferences(next: TelegramPreferences, key: string) {
    const normalized = normalizeTelegramPreferences(next)
    const previous = preferences
    setPreferences(normalized)
    setSavingKey(key)

    try {
      const response = await authFetch("/api/settings/telegram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save")
      setPreferences(normalizeTelegramPreferences(data.preferences))
      if (typeof data.destinationConfigured === "boolean") {
        setDestinationConfigured(data.destinationConfigured)
      }
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

  async function runAction(action: "detect" | "demo") {
    setBusyAction(action)
    try {
      const response = await authFetch("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          accountId: activeAccountId || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Telegram action failed")
      if (data.preferences) {
        setPreferences(normalizeTelegramPreferences(data.preferences))
      }
      if (typeof data.destinationConfigured === "boolean") {
        setDestinationConfigured(data.destinationConfigured)
      }
      toast({
        title: action === "detect" ? "Connected" : "Demo sent",
        description:
          action === "detect"
            ? "Phone alerts are ready."
            : data.message || "Check Telegram on your phone.",
      })
    } catch (error) {
      toast({
        title: action === "detect" ? "Could not connect" : "Demo failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const linked = Boolean(preferences.chatId) || destinationConfigured
  const busy = loading || savingKey != null || busyAction != null

  return (
    <SettingsSection
      id="telegram-alerts"
      icon={Send}
      iconTone="blue"
      title="Telegram"
      description="Phone message when a trade opens or closes."
      defaultOpen
      badge={
        !loading ? (
          <Badge
            variant="outline"
            className={
              preferences.enabled && linked
                ? "text-[10px] font-normal border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "text-[10px] font-normal"
            }
          >
            {preferences.enabled && linked ? "On" : linked ? "Connected" : "Off"}
          </Badge>
        ) : null
      }
    >
      <div className="space-y-4">
        <SettingsRow label="Alerts" description="Send trades to your phone." htmlFor="telegram-enabled">
          <Switch
            id="telegram-enabled"
            checked={preferences.enabled}
            disabled={busy}
            onCheckedChange={(checked) =>
              void savePreferences({ ...preferences, enabled: checked }, "enabled")
            }
          />
        </SettingsRow>

        <SettingsRow
          label="New trades"
          description="When a trade opens."
          htmlFor="telegram-notify-open"
        >
          <Switch
            id="telegram-notify-open"
            checked={preferences.notifyOpen}
            disabled={busy || !preferences.enabled}
            onCheckedChange={(checked) =>
              void savePreferences({ ...preferences, notifyOpen: checked }, "notifyOpen")
            }
          />
        </SettingsRow>

        <SettingsRow
          label="Closed trades"
          description="When a trade closes."
          htmlFor="telegram-notify-close"
        >
          <Switch
            id="telegram-notify-close"
            checked={preferences.notifyClose}
            disabled={busy || !preferences.enabled}
            onCheckedChange={(checked) =>
              void savePreferences({ ...preferences, notifyClose: checked }, "notifyClose")
            }
          />
        </SettingsRow>

        <div className="flex flex-wrap gap-2">
          {linked ? (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void savePreferences({ ...preferences, chatId: "", enabled: false }, "disconnect")}
            >
              <Unplug className="h-4 w-4" />
              Disconnect
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void runAction("detect")}
            >
              <Plug className="h-4 w-4" />
              {busyAction === "detect" ? "Connecting…" : "Connect"}
            </Button>
          )}
        </div>

        <Button
          type="button"
          variant="default"
          className="w-full gap-1.5"
          disabled={busy || !linked}
          onClick={() => void runAction("demo")}
        >
          <BellRing className="h-4 w-4" />
          {busyAction === "demo" ? "Sending…" : "Send demo trade"}
        </Button>
      </div>
    </SettingsSection>
  )
}
