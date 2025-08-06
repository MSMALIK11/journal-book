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
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import LayoutSelector from "@/components/layout/layout-selector"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class"   defaultTheme="dark"  enableSystem>
          <LayoutSelector>{children}</LayoutSelector>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
