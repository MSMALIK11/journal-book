"use client"

import { useEffect, useState } from "react"
import { Copy, KeyRound, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { authFetch } from "@/lib/client-auth"
import { useToast } from "@/hooks/use-toast"

type SyncStatus = {
  has_sync_key: boolean
  extension_connected: boolean
  last_heartbeat: string | null
}

export function TradingViewSyncSettings() {
  const { toast } = useToast()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadStatus() {
    const response = await authFetch("/api/sync/token")
    const data = await response.json()
    if (response.ok) setStatus(data)
  }

  async function generateKey() {
    setLoading(true)
    try {
      const response = await authFetch("/api/sync/token", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to generate key")
      setGeneratedKey(data.sync_api_key)
      await loadStatus()
      toast({
        title: "Sync key generated",
        description: "Copy it now and paste it into the extension options page.",
      })
    } catch (error) {
      toast({
        title: "Could not generate key",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function revokeKey() {
    if (!confirm("Revoke the sync key? The extension will stop syncing until you generate a new one.")) {
      return
    }

    setLoading(true)
    try {
      const response = await authFetch("/api/sync/token", { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to revoke key")
      setGeneratedKey(null)
      await loadStatus()
      toast({ title: "Sync key revoked" })
    } catch (error) {
      toast({
        title: "Could not revoke key",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function copyKey() {
    if (!generatedKey) return
    await navigator.clipboard.writeText(generatedKey)
    toast({ title: "Copied to clipboard" })
  }

  useEffect(() => {
    loadStatus()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          TradingView Sync
        </CardTitle>
        <CardDescription>
          Connect the browser extension to automatically import Strategy Tester trades into your journal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4 text-sm text-muted-foreground space-y-2">
          <p>1. Generate a sync API key below.</p>
          <p>2. Load the extension from the <code className="text-xs">extension/</code> folder in Chrome.</p>
          <p>3. Paste your API URL and key in extension options, then open TradingView Strategy Tester.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={generateKey} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {status?.has_sync_key ? "Regenerate key" : "Generate key"}
          </Button>
          {status?.has_sync_key && (
            <Button variant="outline" onClick={revokeKey} disabled={loading}>
              <Trash2 className="mr-2 h-4 w-4" />
              Revoke key
            </Button>
          )}
        </div>

        {generatedKey && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Your sync key (shown once)</label>
            <div className="flex gap-2">
              <Input readOnly value={generatedKey} />
              <Button type="button" variant="outline" onClick={copyKey}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {status && (
          <p className="text-sm text-muted-foreground">
            Extension: {status.extension_connected ? "Connected" : "Not connected"}
            {status.last_heartbeat ? ` · Last seen ${new Date(status.last_heartbeat).toLocaleTimeString()}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
