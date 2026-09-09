"use client"

import { useEffect, useState } from "react"
import { Cable, Loader2 } from "lucide-react"
import { BrokerConnectionCard } from "@/components/broker/broker-connection-card"
import { ExecutionSettings } from "@/components/broker/execution-settings"
import { SymbolMapping } from "@/components/broker/symbol-mapping"
import { TradeExecutionRules } from "@/components/broker/trade-execution-rules"
import { HudPanel } from "@/components/dashboard/hud-panel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { authFetch } from "@/lib/client-auth"
import {
  DEFAULT_EXECUTION,
  type BrokerConfigPublic,
  type BrokerExecutionPreferences,
  type BrokerName,
} from "@/lib/broker/broker-config"

export function BrokerConfigForm() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [confirmEnable, setConfirmEnable] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [broker, setBroker] = useState<BrokerName>("xm")
  const [login, setLogin] = useState("")
  const [server, setServer] = useState("")
  const [password, setPassword] = useState("")
  const [connection, setConnection] = useState<BrokerConfigPublic["connection"] | null>(null)
  const [execution, setExecution] = useState<BrokerExecutionPreferences>(DEFAULT_EXECUTION)

  function applyConfig(config: BrokerConfigPublic, options?: { keepPassword?: boolean }) {
    setBroker(config.connection.broker)
    setLogin(config.connection.login)
    setServer(config.connection.server)
    setConnection(config.connection)
    setExecution(config.execution)
    if (!options?.keepPassword) {
      setPassword("")
      setShowPassword(false)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const response = await authFetch("/api/broker/config")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to load configuration")
        applyConfig(data.config as BrokerConfigPublic)
      } catch (error) {
        toast({
          title: "Could not load broker settings",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  function validate(requirePassword: boolean) {
    if (!login || !/^\d{4,20}$/.test(login)) return "Account login must be numeric"
    if (!server.trim()) return "Server is required"
    if (requirePassword && !password) return "MT5 password is required for a new connection"
    if (!(execution.defaultLot > 0)) return "Lot size must be greater than 0"
    if (!(execution.maxOpenPositions >= 1)) return "Maximum positions must be at least 1"
    return null
  }

  async function save(nextExecution = execution) {
    const error = validate(!connection?.hasPassword)
    if (error) {
      toast({ title: "Check the form", description: error, variant: "destructive" })
      return false
    }
    setSaving(true)
    try {
      const response = await authFetch("/api/broker/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker,
          platform: "mt5",
          login,
          server: server.trim(),
          password: password || undefined,
          execution: nextExecution,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Save failed")
      applyConfig(data.config as BrokerConfigPublic)
      toast({ title: "Configuration saved successfully" })
      return true
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    const error = validate(!connection?.hasPassword)
    if (error) {
      toast({ title: "Check the form", description: error, variant: "destructive" })
      return
    }
    setTesting(true)
    try {
      const response = await authFetch("/api/broker/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login,
          server: server.trim(),
          password: password || undefined,
        }),
      })
      const data = await response.json()
      if (data.config) applyConfig(data.config as BrokerConfigPublic, { keepPassword: true })
      if (response.status === 501) {
        toast({
          title: "Connection failed",
          description: "MT5 worker is not configured",
          variant: "destructive",
        })
        return
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Connection failed")
      }
      toast({ title: "Connected successfully", description: data.message })
    } catch (error) {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const busy = saving || testing
  const canEnable = connection?.status === "connected" && connection.hasPassword

  if (loading || !connection) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <HudPanel className="px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <p className="hud-label">Execution</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-cyan-100">Broker & MT5</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Connect your trading account and configure automatic trade execution.
            </p>
          </div>
        </div>
      </HudPanel>

      <BrokerConnectionCard
        broker={broker}
        platform="mt5"
        login={login}
        server={server}
        password={password}
        showPassword={showPassword}
        connection={connection}
        testing={testing}
        disabled={busy}
        onBrokerChange={setBroker}
        onLoginChange={setLogin}
        onServerChange={setServer}
        onPasswordChange={setPassword}
        onTogglePassword={() => setShowPassword((visible) => !visible)}
        onTest={() => void testConnection()}
      />

      <ExecutionSettings
        enabled={execution.enabled}
        canEnable={Boolean(canEnable)}
        disabled={busy}
        onRequestEnable={() => setConfirmEnable(true)}
        onDisable={() => void save({ ...execution, enabled: false })}
      />

      <TradeExecutionRules execution={execution} disabled={busy} onChange={setExecution} />

      <SymbolMapping
        mappings={execution.mappings}
        disabled={busy}
        onChange={(mappings) => setExecution({ ...execution, mappings })}
      />

      <div className="flex justify-end">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Configuration
        </Button>
      </div>

      <AlertDialog open={confirmEnable} onOpenChange={setConfirmEnable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable automatic trade execution?</AlertDialogTitle>
            <AlertDialogDescription>
              This will allow eligible TradingView signals to place trades on your connected MT5 account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmEnable(false)
                void save({ ...execution, enabled: true })
              }}
            >
              Enable Execution
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
