import { ReactNode } from "react"
import { Sidebar } from "./sidebar"
import { MarketTicker } from "../IndexTicker"
// import IndianIndex from "../analytics/nse-market-tracker"


interface SiteLayoutProps {
  children: ReactNode
}

export default function SideLayout({ children }: SiteLayoutProps) {
  return (
     <div className="flex min-h-screen w-full">
      {/* Sidebar (fixed width) */}
      <div className="lg:w-64">
        <Sidebar />
      </div>

      {/* Main content (takes rest of the space) */}
      <main className="flex-1 p-6">
        <MarketTicker/>
        {/* <IndianIndex /> */}
        {children}
      </main>
    </div>
  )
}
