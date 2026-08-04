import { Sidebar } from "@/components/layout/sidebar"
import { AccountsManager } from "@/components/accounts/accounts-manager"

export default function AccountsPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 lg:ml-64 p-4 lg:p-8">
        <div className="space-y-6 max-w-3xl">
          <div>
            <h1 className="text-3xl font-bold">Trading Accounts</h1>
            <p className="text-muted-foreground">
              Manage separate portfolios under one login. Switch accounts in the sidebar to view each
              journal separately.
            </p>
          </div>
          <AccountsManager />
        </div>
      </div>
    </div>
  )
}
