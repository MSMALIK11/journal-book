"use client"

import React from "react"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background hud-grid flex items-center justify-center p-4">
          <HudPanel className="w-full max-w-md p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Something went wrong
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The application encountered an error. This might be due to missing configuration.
            </p>
            <div className="mt-4 space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{this.state.error?.message || "An unexpected error occurred"}</AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Common solutions:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Check that your Supabase environment variables are set correctly</li>
                  <li>Ensure your Supabase project is active and accessible</li>
                  <li>Verify that the database tables have been created</li>
                </ul>
              </div>

              <Button
                onClick={() => {
                  this.setState({ hasError: false })
                  window.location.reload()
                }}
                className="w-full"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </div>
          </HudPanel>
        </div>
      )
    }

    return this.props.children
  }
}
