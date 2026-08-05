import { ReactNode } from "react"
import { ActiveAccountProvider } from "@/hooks/use-active-account"
import { SyncAccountAutoSwitch } from "@/components/sync/sync-account-auto-switch"
import { AppHeader } from "@/components/layout/app-header"
import { Sidebar } from "./sidebar"

interface SiteLayoutProps {
  children: ReactNode
}

export default function SideLayout({ children }: SiteLayoutProps) {
  return (
    <ActiveAccountProvider>
      <SyncAccountAutoSwitch />
      <div className="flex min-h-screen w-full">
        <div className="hidden w-64 shrink-0 lg:block" aria-hidden />
        <Sidebar />
        <AppHeader />

        <main className="min-w-0 flex-1 overflow-auto px-4 pb-8 pt-20 sm:px-5 lg:px-6 lg:pb-10 lg:pt-16">
          {children}
        </main>
      </div>
    </ActiveAccountProvider>
  )
}
