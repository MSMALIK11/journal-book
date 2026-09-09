"use client"

import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { ConnectionStatus } from "@/components/broker/connection-status"
import type { BrokerConnectionPublic, BrokerName, BrokerPlatform } from "@/lib/broker/broker-config"

type Props = {
  broker: BrokerName
  platform: BrokerPlatform
  login: string
  server: string
  password: string
  showPassword: boolean
  connection: BrokerConnectionPublic
  testing: boolean
  disabled?: boolean
  onBrokerChange: (value: BrokerName) => void
  onLoginChange: (value: string) => void
  onServerChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onTest: () => void
}

export function BrokerConnectionCard({
  broker,
  platform,
  login,
  server,
  password,
  showPassword,
  connection,
  testing,
  disabled,
  onBrokerChange,
  onLoginChange,
  onServerChange,
  onPasswordChange,
  onTogglePassword,
  onTest,
}: Props) {
  return (
    <HudPanel>
      <HudPanelHeader
        title="Broker Connection"
        description="XM MetaTrader 5 login is stored encrypted. The password is never shown after save."
      />
      <div className="space-y-4 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Broker</Label>
            <Select value={broker} onValueChange={(value) => onBrokerChange(value as BrokerName)} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select broker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xm">XM</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} disabled>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mt5">MetaTrader 5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mt5-login">Account Login</Label>
            <Input
              id="mt5-login"
              inputMode="numeric"
              autoComplete="off"
              placeholder="12345678"
              value={login}
              disabled={disabled}
              onChange={(event) => onLoginChange(event.target.value.replace(/\D/g, "").slice(0, 20))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mt5-server">Server</Label>
            <Input
              id="mt5-server"
              autoComplete="off"
              placeholder="XMGlobal-MT5"
              value={server}
              disabled={disabled}
              onChange={(event) => onServerChange(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mt5-password">MT5 Password</Label>
          <div className="relative">
            <Input
              id="mt5-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={connection.hasPassword ? "Leave blank to keep saved password" : "MT5 master password"}
              value={password}
              disabled={disabled}
              onChange={(event) => onPasswordChange(event.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={onTogglePassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || testing || !connection.configured}
            onClick={onTest}
          >
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {testing ? "Testing connection..." : "Test Connection"}
          </Button>
          {!connection.configured ? (
            <p className="text-xs text-muted-foreground">Save the configuration first.</p>
          ) : null}
        </div>

        <ConnectionStatus connection={connection} pending={testing} />
      </div>
    </HudPanel>
  )
}
