import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js"

/** @type {import('next').NextConfig} */
const nextConfig = (phase) => {
  const isDevelopment = phase === PHASE_DEVELOPMENT_SERVER

  return {
    // Keep dev and production artifacts isolated so `next build` cannot
    // invalidate CSS or route chunks used by a running dev server.
    distDir: isDevelopment ? ".next-dev" : ".next",
    poweredByHeader: false,
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    images: {
      unoptimized: true,
    },
    outputFileTracingIncludes: {
      "/api/extension": ["./extension/**/*"],
      "/api/extension/download": ["./extension/**/*"],
    },
    async headers() {
      return [
        {
          source: "/api/sync/:path*",
          headers: [
            { key: "Access-Control-Allow-Origin", value: "*" },
            { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
            {
              key: "Access-Control-Allow-Headers",
              value: "Content-Type, Authorization, X-Sync-Key",
            },
          ],
        },
        {
          source: "/:path*",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
            { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ],
        },
      ]
    },
  }
}

export default nextConfig
