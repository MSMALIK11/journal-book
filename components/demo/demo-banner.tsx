"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Info, Settings } from "lucide-react"

export function DemoBanner() {
  return (
    <Alert className="mb-6">
      <Info className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>You're viewing a demo version. Set up Supabase to save your data permanently.</span>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Configure
        </Button>
      </AlertDescription>
    </Alert>
  )
}
