"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Input } from "@/components/ui/input"
import { authFetch } from "@/lib/client-auth"
import { useToast } from "@/hooks/use-toast"

const MAX_WATCH_SYMBOLS = 5

function parseSymbolsText(text: string) {
  return text
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, MAX_WATCH_SYMBOLS)
}

export function WatchSymbolsSettings() {
  const { toast } = useToast()
  const [symbolsText, setSymbolsText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadSymbols = useCallback(async () => {
    setLoading(true)
    try {
      const response = await authFetch("/api/settings/watch-symbols")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to load watch symbols")
      setSymbolsText((data.watch_symbols || []).join(", "))
    } catch (error) {
      toast({
        title: "Could not load watch symbols",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadSymbols()
  }, [loadSymbols])

  async function saveSymbols() {
    setSaving(true)
    try {
      const watch_symbols = parseSymbolsText(symbolsText)
      const response = await authFetch("/api/settings/watch-symbols", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watch_symbols }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to save watch symbols")
      setSymbolsText((data.watch_symbols || []).join(", "))
      toast({
        title: "Watch symbols saved",
        description:
          data.watch_symbols?.length
            ? `Extension will sync ${data.watch_symbols.join(", ")} in background tabs.`
            : "Only your visible TradingView chart will sync.",
      })
    } catch (error) {
      toast({
        title: "Could not save watch symbols",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <HudPanel>
      <HudPanelHeader
        title="Multi-Symbol Watch"
        description="Keep one visible chart (e.g. BTC). The extension opens background TradingView tabs for these symbols using your saved layout."
        action={<Eye className="h-4 w-4 text-cyan-300" />}
      />
      <div className="space-y-4 p-5">
        <div className="space-y-2 rounded-lg border border-cyan-400/15 bg-[#05070a]/60 p-4 text-sm text-muted-foreground">
          <p>1. Save your TradingView chart layout with your strategy on the visible chart.</p>
          <p>2. Add up to {MAX_WATCH_SYMBOLS} symbols below (match your scanner pairs).</p>
          <p>3. Extension creates pinned background tabs — you do not need to open them manually.</p>
          <p>4. Keep the journal tab open for desktop trade alarms.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="watch-symbols">
            Watch symbols (comma-separated)
          </label>
          <Input
            id="watch-symbols"
            placeholder="XAUUSD, ETHUSDT, SOLUSD"
            value={symbolsText}
            disabled={loading}
            onChange={(e) => setSymbolsText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Examples: XAUUSD, BTCUSDT, ETHUSDT, SOLUSD, XAGUSD, USOIL. Max {MAX_WATCH_SYMBOLS}.
          </p>
        </div>

        <Button onClick={saveSymbols} disabled={loading || saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : "Save watch symbols"}
        </Button>
      </div>
    </HudPanel>
  )
}
