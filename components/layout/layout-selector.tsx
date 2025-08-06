"use client"

import { usePathname } from "next/navigation"
import DashboardLayout from "@/components/layout/side-layout"
import PublicLayout from "@/components/layout/public-layout"

export default function LayoutSelector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Define public routes here
  const publicRoutes = ["/", "/landing-page", "/login", "/register"]

  const isPublicRoute = publicRoutes.some((route) => pathname === route)

  return isPublicRoute ? (
    <PublicLayout>{children}</PublicLayout>
  ) : (
    <DashboardLayout>{children}</DashboardLayout>
  )
}
