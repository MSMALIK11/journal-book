import { LiveSyncSettings } from "@/components/settings/live-sync-settings"
import { AccountsSettings } from "@/components/settings/accounts-settings"
import { AlertSettings } from "@/components/settings/alert-settings"

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your journal preferences and manage accounts.</p>
      </div>

      <AccountsSettings />
      <AlertSettings />
      <LiveSyncSettings />
    </div>
  )
}
