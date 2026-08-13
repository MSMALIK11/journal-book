import { ProfileSetup } from "@/components/profile/profile-setup"
import { TradingViewSyncSettings } from "@/components/sync/tradingview-sync-settings"

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TradingViewSyncSettings />
      <ProfileSetup />
    </div>
  )
}
