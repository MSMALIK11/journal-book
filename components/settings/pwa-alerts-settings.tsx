"use client"

import { useEffect, useState } from "react"
import { BellRing, Smartphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SettingsHint, SettingsRow, SettingsSection } from "@/components/settings/settings-section"
import {
  isStandalonePwa,
  pushPermissionState,
  subscribeToPushAlerts,
  unsubscribeFromPushAlerts,
} from "@/lib/pwa/client"
import { useToast } from "@/hooks/use-toast"

export function PwaAlertsSettings() {
  const { toast } = useToast()
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  const [standalone, setStandalone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPermission(pushPermissionState() as NotificationPermission | "unsupported")
    setStandalone(isStandalonePwa())
  }, [])

  async function enablePhoneAlerts() {
    setBusy(true)
    try {
      const result = await subscribeToPushAlerts()
      setPermission(pushPermissionState() as NotificationPermission | "unsupported")
      if (!result.ok) throw new Error(result.error || "Could not enable phone alerts")
      toast({
        title: "Phone alerts enabled",
        description: "You will get push notifications even when the app is in the background.",
      })
    } catch (error) {
      toast({
        title: "Could not enable phone alerts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function disablePhoneAlerts() {
    setBusy(true)
    try {
      await unsubscribeFromPushAlerts()
      setPermission(pushPermissionState() as NotificationPermission | "unsupported")
      toast({ title: "Phone alerts disabled" })
    } catch (error) {
      toast({
        title: "Could not disable phone alerts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const enabled = permission === "granted"

  return (
    <SettingsSection
      title="Phone app (PWA)"
      description="Add this site to your home screen, stay signed in, and get push alerts when TradingView fills arrive."
      icon={Smartphone}
    >
      <SettingsRow
        label="Install status"
        description={
          standalone
            ? "Running as an installed home-screen app."
            : "Use Share → Add to Home Screen on iPhone, or Install app in Chrome on Android."
        }
      >
        <Badge variant={standalone ? "default" : "secondary"}>
          {standalone ? "Installed" : "Browser tab"}
        </Badge>
      </SettingsRow>

      <SettingsRow
        label="Background push alerts"
        description="Rings/vibrates on your phone when a new open or close is synced — even if the app is not open."
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={enabled ? "default" : "secondary"}>
            {permission === "unsupported"
              ? "Unsupported"
              : enabled
                ? "Enabled"
                : permission === "denied"
                  ? "Blocked"
                  : "Off"}
          </Badge>
          {enabled ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void disablePhoneAlerts()}>
              Disable
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={busy || permission === "unsupported"} onClick={() => void enablePhoneAlerts()}>
              <BellRing className="mr-2 h-4 w-4" />
              Enable on this phone
            </Button>
          )}
        </div>
      </SettingsRow>

      <SettingsHint>
        iPhone: install to home screen first (iOS 16.4+), then tap Enable. Keep system notification permission on.
        The in-app sound alarm still works when Live Sync is open in front.
      </SettingsHint>
    </SettingsSection>
  )
}
