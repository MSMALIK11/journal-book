import { ReactNode } from "react"
import { ActiveAccountProvider } from "@/hooks/use-active-account"
import { Sidebar } from "./sidebar"

interface SiteLayoutProps {
  children: ReactNode
}

export default function SideLayout({ children }: SiteLayoutProps) {
  return (
    <ActiveAccountProvider>
      <div className="flex min-h-screen w-full">
        <div className="hidden w-64 shrink-0 lg:block" aria-hidden />
        <Sidebar />

        <main className="min-w-0 flex-1 overflow-auto px-4 pb-8 pt-20 sm:px-5 lg:px-6 lg:pb-10 lg:pt-6">
          {children}
        </main>
      </div>
    </ActiveAccountProvider>
  )
}
