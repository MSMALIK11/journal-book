"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Calendar,
  Calculator,
  FileText,
  Home,
  LogOut,
  Menu,
  Microscope,
  PlusCircle,
  Radio,
  Settings,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { signOut } from "@/lib/client-auth"
import { AccountSwitcher } from "@/components/accounts/account-switcher"
import { SystemStatus } from "@/components/layout/live-status"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Live Sync", href: "/live-sync", icon: Radio },
  { name: "Pip Calculator", href: "/pip-calculator", icon: Calculator },
  { name: "Add Trade", href: "/trades/new", icon: PlusCircle },
  { name: "Trade History", href: "/trades", icon: FileText },
  { name: "Strategy", href: "/strategy", icon: FileText },
  { name: "Analytics", href: "/analytics", icon: BarChart3, description: "Backtest & performance insights" },
  { name: "Research", href: "/research", icon: Microscope, description: "Patterns & trading style" },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  return (
    <>
      <div className="lg:hidden fixed top-3 left-3 z-50">
        <Button variant="outline" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-cyan-400/15 bg-[#06080c] transition-transform duration-200 ease-in-out lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center border-b border-cyan-400/15 px-4">
          <p className="truncate text-sm font-semibold text-cyan-100">Trading Journal</p>
        </div>

        <div className="px-3 pt-4">
          <AccountSwitcher className="border-cyan-400/20 bg-transparent text-cyan-100 hover:bg-cyan-400/10" />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch
                title={"description" in item ? item.description : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                  isActive
                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-200"
                    : "border-transparent text-muted-foreground hover:bg-cyan-400/5 hover:text-cyan-100",
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="space-y-3 border-t border-cyan-400/15 p-3">
          <SystemStatus />
          <Button
            variant="outline"
            className="w-full border-cyan-400/20 bg-transparent text-muted-foreground hover:text-cyan-100"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      ) : null}
    </>
  )
}
