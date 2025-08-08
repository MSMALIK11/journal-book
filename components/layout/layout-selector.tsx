// "use client"

// import { usePathname } from "next/navigation"
// import DashboardLayout from "@/components/layout/side-layout"
// import PublicLayout from "@/components/layout/public-layout"
// import { ErrorBoundary } from "../error-boundary"

// export default function LayoutSelector({ children }: { children: React.ReactNode }) {
//   const pathname = usePathname()

//   // Define public routes here
//   const publicRoutes = ["/", "/landing-page", "/login", "/register"]

//   const isPublicRoute = publicRoutes.some((route) => pathname === route)

//   return ( <ErrorBoundary>
//       {isPublicRoute ? (
//         <PublicLayout>{children}</PublicLayout>
//       ) : (
//         <DashboardLayout>{children}</DashboardLayout>
//       )}
//     </ErrorBoundary>)
// }


"use client";

import { usePathname } from "next/navigation";
import DashboardLayout from "@/components/layout/side-layout";
import PublicLayout from "@/components/layout/public-layout";
import { ErrorBoundary } from "../error-boundary";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function LayoutSelector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [queryClient] = useState(() => new QueryClient());

  // Define public routes here
  const publicRoutes = ["/", "/landing-page", "/login", "/register"];
  const isPublicRoute = publicRoutes.some((route) => pathname === route);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {isPublicRoute ? (
          <PublicLayout>{children}</PublicLayout>
        ) : (
          <DashboardLayout>{children}</DashboardLayout>
        )}
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
