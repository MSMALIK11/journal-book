import { Sidebar } from "@/components/layout/sidebar"
import { ProfileSetup } from "@/components/profile/profile-setup"
import { TradingViewSyncSettings } from "@/components/sync/tradingview-sync-settings"

export default function ProfilePage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 lg:ml-64 p-4 lg:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Profile Settings</h1>
            <p className="text-muted-foreground">Manage your profile and trading preferences</p>
          </div>
          <TradingViewSyncSettings />
          <ProfileSetup />
        </div>
      </div>
    </div>
  )
}
