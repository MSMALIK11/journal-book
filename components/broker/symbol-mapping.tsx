"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import type { BrokerSymbolMapping } from "@/lib/broker/broker-config"

type Props = {
  mappings: BrokerSymbolMapping[]
  disabled?: boolean
  onChange: (next: BrokerSymbolMapping[]) => void
}

const emptyDraft = { tradingViewSymbol: "", mt5Symbol: "", enabled: true }

export function SymbolMapping({ mappings, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)

  function startAdd() {
    setEditingId(null)
    setDraft(emptyDraft)
    setOpen(true)
  }

  function startEdit(row: BrokerSymbolMapping) {
    setEditingId(row.id)
    setDraft({
      tradingViewSymbol: row.tradingViewSymbol,
      mt5Symbol: row.mt5Symbol,
      enabled: row.enabled,
    })
    setOpen(true)
  }

  function saveDraft() {
    const tradingViewSymbol = draft.tradingViewSymbol.trim().toUpperCase()
    const mt5Symbol = draft.mt5Symbol.trim().toUpperCase()
    if (!tradingViewSymbol || !mt5Symbol) return
    const id = editingId ?? `${tradingViewSymbol}:${mt5Symbol}`
    const nextRow: BrokerSymbolMapping = { id, tradingViewSymbol, mt5Symbol, enabled: draft.enabled }
    const without = mappings.filter((row) => row.id !== id)
    onChange([...without, nextRow])
    setOpen(false)
  }

  return (
    <HudPanel>
      <HudPanelHeader
        title="Symbol Mapping"
        description="TradingView symbols can differ from XM MT5 names. These rows are configuration only."
        action={
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={startAdd}>
            <Plus className="mr-1 h-4 w-4" />
            Add Mapping
          </Button>
        }
      />
      <div className="px-5 py-4">
        {mappings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-cyan-400/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No mappings yet. Add XAUUSD → XAUUSD when you are ready.
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>TradingView Symbol</TableHead>
                    <TableHead>MT5 Symbol</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.tradingViewSymbol}</TableCell>
                      <TableCell>{row.mt5Symbol}</TableCell>
                      <TableCell>
                        <Switch
                          checked={row.enabled}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            onChange(mappings.map((item) => (item.id === row.id ? { ...item, enabled: checked } : item)))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="icon" variant="ghost" disabled={disabled} onClick={() => startEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => onChange(mappings.filter((item) => item.id !== row.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {mappings.map((row) => (
                <div key={row.id} className="rounded-xl border border-cyan-400/15 px-4 py-3">
                  <p className="text-sm font-medium">
                    {row.tradingViewSymbol} → {row.mt5Symbol}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <Switch
                      checked={row.enabled}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange(mappings.map((item) => (item.id === row.id ? { ...item, enabled: checked } : item)))
                      }
                    />
                    <div>
                      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => onChange(mappings.filter((item) => item.id !== row.id))}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit mapping" : "Add mapping"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="tv-symbol">TradingView Symbol</Label>
              <Input
                id="tv-symbol"
                value={draft.tradingViewSymbol}
                onChange={(event) => setDraft({ ...draft, tradingViewSymbol: event.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt5-symbol">MT5 Symbol</Label>
              <Input
                id="mt5-symbol"
                value={draft.mt5Symbol}
                onChange={(event) => setDraft({ ...draft, mt5Symbol: event.target.value.toUpperCase() })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="map-enabled">Enabled</Label>
              <Switch
                id="map-enabled"
                checked={draft.enabled}
                onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveDraft}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HudPanel>
  )
}
