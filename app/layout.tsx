// import type React from "react"
// import type { Metadata } from "next"
// import { Inter } from "next/font/google"
// import "./globals.css"
// import { Toaster } from "@/components/ui/toaster"
// import { ThemeProvider } from "@/components/theme-provider"
// import SideLayout from "@/components/layout/side-layout"
// const inter = Inter({ subsets: ["latin"] })

// export const metadata: Metadata = {
//   title: "Trading Journal",
//   description: "Track and analyze your trading performance",
//     generator: 'v0.dev'
// }

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html lang="en" suppressHydrationWarning>
//       <body className={inter.className}>
//         <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
//           <SideLayout>
//             {children}
//           </SideLayout>
//           <Toaster />
//         </ThemeProvider>
//       </body>
//     </html>
//   )
// }

import "./globals.css"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import LayoutSelector from "@/components/layout/layout-selector"
import { RouteChangeLoader } from "@/components/layout/route-change-loader"
import { PwaProvider } from "@/components/pwa/pwa-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Trading Journal",
  description: "Live sync, trade alerts, and journal for TradingView fills",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Journal",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
  },
}

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class"   defaultTheme="dark"  enableSystem>
          <PwaProvider />
          <RouteChangeLoader />
          <LayoutSelector>{children}</LayoutSelector>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
