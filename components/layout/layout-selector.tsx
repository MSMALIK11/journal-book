"use client"

import { usePathname } from "next/navigation"
import DashboardLayout from "@/components/layout/side-layout"
import PublicLayout from "@/components/layout/public-layout"

export default function LayoutSelector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname?.startsWith("/public")

  return !isDashboard ? (
    <DashboardLayout>{children}</DashboardLayout>
  ) : (
    <PublicLayout>{children}</PublicLayout>
  )
}
