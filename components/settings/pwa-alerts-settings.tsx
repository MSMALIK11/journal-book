"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, BellRing, Smartphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SettingsHint, SettingsRow, SettingsSection } from "@/components/settings/settings-section"
import {
  getPushAlertStatus,
  subscribeToPushAlerts,
  type PushAlertStatus,
  unsubscribeFromPushAlerts,
} from "@/lib/pwa/client"
import { useToast } from "@/hooks/use-toast"

function statusLabel(status: PushAlertStatus | null) {
  if (!status) return "Checking…"
  if (status.permission === "unsupported") return "Unsupported"
  if (status.permission === "denied") return "Blocked"
  if (status.needsHomeScreenInstall) return "Install app first"
  if (!status.serverConfigured) return "Server not configured"
  if (status.active) return "Active"
  if (status.permission === "granted" && status.hasSubscription) return "Partial"
  if (status.permission === "granted") return "Permission only"
  return "Off"
}

function statusBadgeVariant(status: PushAlertStatus | null): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "secondary"
  if (status.active) return "default"
  if (status.permission === "denied") return "destructive"
  if (status.needsHomeScreenInstall || !status.serverConfigured) return "outline"
  return "secondary"
}

export function PwaAlertsSettings() {
  const { toast } = useToast()
  const [status, setStatus] = useState<PushAlertStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    setStatus(await getPushAlertStatus())
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  async function enablePhoneAlerts() {
    setBusy(true)
    try {
      const result = await subscribeToPushAlerts()
      await refreshStatus()
      if (!result.ok) throw new Error(result.error || "Could not enable phone alerts")
      toast({
        title: "Phone alerts active",
        description: "Background push is on for this phone.",
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
      await refreshStatus()
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

  const label = statusLabel(status)
  const canEnable =
    status &&
    status.permission !== "unsupported" &&
    status.permission !== "denied" &&
    !status.active &&
    status.serverConfigured
  const showDisable = status?.active || (status?.permission === "granted" && status?.hasSubscription)

  return (
    <SettingsSection
      id="pwa-alerts"
      icon={Smartphone}
      iconTone="emerald"
      title="Phone app (PWA)"
      description="Add this site to your home screen, stay signed in, and get push alerts when TradingView fills arrive."
    >
      <SettingsRow
        label="Install status"
        description={
          status?.standalone
            ? "Running as an installed home-screen app."
            : "Use Share → Add to Home Screen on iPhone, or Install app in Chrome on Android."
        }
      >
        <Badge variant={status?.standalone ? "default" : "secondary"}>
          {status?.standalone ? "Installed" : "Browser tab"}
        </Badge>
      </SettingsRow>

      <SettingsRow
        label="Background push alerts"
        description={
          status?.active
            ? "This phone will ring/vibrate when a trade opens or closes — even in the background."
            : status?.needsHomeScreenInstall
              ? "Permission may look on, but iPhone only delivers push from the home-screen app — not Safari tabs."
              : "Rings/vibrates on your phone when a new open or close is synced — even if the app is not open."
        }
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={statusBadgeVariant(status)}>{label}</Badge>
          {showDisable ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void disablePhoneAlerts()}>
              Turn off
            </Button>
          ) : canEnable ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void enablePhoneAlerts()}>
              <BellRing className="mr-2 h-4 w-4" />
              Turn on
            </Button>
          ) : null}
        </div>
      </SettingsRow>

      {status?.needsHomeScreenInstall ? (
        <div className="mb-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p>
            iPhone Safari tab does <strong>not</strong> receive background push. Tap Share →{" "}
            <strong>Add to Home Screen</strong>, open the app from that icon, then tap <strong>Turn on</strong>.
          </p>
        </div>
      ) : null}

      {!status?.serverConfigured && status && status.permission !== "unsupported" ? (
        <div className="mb-3 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <p>
            Push keys are missing on this server (<code className="text-[10px]">WEB_PUSH_PUBLIC_KEY</code> /{" "}
            <code className="text-[10px]">WEB_PUSH_PRIVATE_KEY</code>). Local dev needs them too if sync runs on
            localhost.
          </p>
        </div>
      ) : null}

      <SettingsHint>
        <strong>Active</strong> = permission + push subscription + ready to deliver. On iPhone, install to home screen
        first (iOS 16.4+). The in-app sound alarm still works when Live Sync is open in front.
      </SettingsHint>
    </SettingsSection>
  )
}
