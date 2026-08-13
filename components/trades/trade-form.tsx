"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useToast } from "@/hooks/use-toast"
import { authFetch } from "@/lib/client-auth"
import {
  calculatePips,
  calculateTicks,
  calculatePositionValue,
  calculatePriceMove,
  calculateProfit,
  calculateRisk,
  calculateRR,
} from "@/lib/trading/calculator"
import {
  ASSET_TYPE_DEFAULTS,
  getQuantityMode,
  INSTRUMENT_LIST,
  type AssetType,
  type InstrumentSpec,
  type InstrumentSpecification,
} from "@/lib/instruments"
import { cn } from "@/lib/utils"
import { tradeSchema, type TradeFormValues } from "@/lib/validations/trade"

type InstrumentOption = InstrumentSpecification

const fallbackInstruments: InstrumentOption[] = INSTRUMENT_LIST

const getLocalDateTime = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

const defaultValues: TradeFormValues = {
  instrument: "",
  trade_type: undefined as unknown as "Buy" | "Sell",
  order_type: undefined as unknown as "Cash" | "Futures" | "Options",
  entry_date: getLocalDateTime(),
  exit_date: undefined,
  entry_price: undefined as unknown as number,
  exit_price: undefined,
  quantity: 1,
  asset_type: "crypto",
  quantity_mode: "units",
  base_currency: ASSET_TYPE_DEFAULTS.crypto.baseCurrency,
  contract_size: ASSET_TYPE_DEFAULTS.crypto.contractSize,
  tick_size: ASSET_TYPE_DEFAULTS.crypto.tickSize,
  tick_value: ASSET_TYPE_DEFAULTS.crypto.tickValue,
  pip_size: ASSET_TYPE_DEFAULTS.crypto.pipSize,
  quote_currency: ASSET_TYPE_DEFAULTS.crypto.quoteCurrency,
  decimal_places: ASSET_TYPE_DEFAULTS.crypto.decimalPlaces,
  min_lot: ASSET_TYPE_DEFAULTS.crypto.minLot,
  max_lot: ASSET_TYPE_DEFAULTS.crypto.maxLot,
  lot_step: ASSET_TYPE_DEFAULTS.crypto.lotStep,
  account_balance: undefined,
  stop_loss: undefined,
  target: undefined,
  strategy: "",
  emotion_tag: "",
  confidence_rating: 5,
  followed_plan: true,
  mistake_tag: "",
  setup_notes: "",
  review_notes: "",
  tags: [],
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1.5 text-xs font-medium text-rose-500">{message}</p>
}

function FieldLabel({
  htmlFor,
  children,
  optional = false,
}: {
  htmlFor: string
  children: React.ReactNode
  optional?: boolean
}) {
  return (
    <Label htmlFor={htmlFor} className="mb-2 flex items-center gap-1.5 text-sm font-medium">
      {children}
      {optional ? (
        <span className="text-xs font-normal text-muted-foreground">(optional)</span>
      ) : (
        <span className="text-rose-500">*</span>
      )}
    </Label>
  )
}

export function TradeForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [tagInput, setTagInput] = useState("")
  const [instruments, setInstruments] = useState<InstrumentOption[]>(fallbackInstruments)
  const [instrumentsLoading, setInstrumentsLoading] = useState(true)
  const [instrumentDialogOpen, setInstrumentDialogOpen] = useState(false)
  const [editingInstrument, setEditingInstrument] = useState(false)
  const [newInstrument, setNewInstrument] = useState<InstrumentSpec>({
    symbol: "",
    name: "",
    ...ASSET_TYPE_DEFAULTS.forex,
  })
  const [addingInstrument, setAddingInstrument] = useState(false)

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TradeFormValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues,
    mode: "onBlur",
  })

  useEffect(() => {
    async function loadInstruments() {
      setInstrumentsLoading(true)
      try {
        const response = await authFetch("/api/instruments")
        const data = await response.json()
        if (response.ok && data.instruments?.length) {
          setInstruments(data.instruments)
        }
      } catch {
        // Keep the built-in list available if the request temporarily fails.
      } finally {
        setInstrumentsLoading(false)
      }
    }

    loadInstruments()
  }, [])

  const values = watch()

  const metrics = useMemo(() => {
    const entry = Number(values.entry_price) || 0
    const exit = Number(values.exit_price) || 0
    const stop = Number(values.stop_loss) || 0
    const target = Number(values.target) || 0
    const lotSize = Number(values.quantity) || 0
    const hasDirection = values.trade_type === "Buy" || values.trade_type === "Sell"
    const direction = values.trade_type as "Buy" | "Sell"
    const instrument: InstrumentSpecification = {
      symbol: values.instrument || "",
      name: values.instrument || "",
      assetType: values.asset_type,
      baseCurrency: values.base_currency,
      quoteCurrency: values.quote_currency || "USD",
      contractSize: Number(values.contract_size) || 1,
      tickSize: Number(values.tick_size) || 0.01,
      tickValue: Number(values.tick_value) || 0.01,
      pipSize: Number(values.pip_size) || 0.01,
      decimalPlaces: Number(values.decimal_places) || 2,
      minLot: Number(values.min_lot) || 0.01,
      maxLot: Number(values.max_lot) || 100,
      lotStep: Number(values.lot_step) || 0.01,
      isDefault: false,
    }

    const difference = hasDirection
      ? calculatePriceMove(entry, exit, direction)
      : null
    const pips = calculatePips(difference, instrument)
    const ticks = calculateTicks(difference, instrument)
    const pnl = hasDirection
      ? calculateProfit({
          entryPrice: entry,
          exitPrice: exit,
          size: lotSize,
          direction,
          instrument,
        })
      : null
    const risk = hasDirection
      ? calculateRisk({
          entryPrice: entry,
          stopLoss: stop,
          size: lotSize,
          instrument,
          accountBalance: Number(values.account_balance) || null,
        })
      : { amount: null, percentage: null }
    const targetProfit = hasDirection
      ? calculateProfit({
          entryPrice: entry,
          exitPrice: target,
          size: lotSize,
          direction,
          instrument,
        })
      : null
    const positionValue = calculatePositionValue(entry, lotSize, instrument)
    const riskReward = calculateRR(pnl, risk.amount)

    return {
      pnl,
      difference,
      pips,
      ticks,
      riskAmount: risk.amount,
      riskPercentage: risk.percentage,
      reward: targetProfit === null ? null : Math.abs(targetProfit),
      riskReward,
      positionValue,
    }
  }, [
    values.instrument,
    values.entry_price,
    values.exit_price,
    values.quantity,
    values.asset_type,
    values.quantity_mode,
    values.base_currency,
    values.contract_size,
    values.tick_size,
    values.tick_value,
    values.pip_size,
    values.quote_currency,
    values.decimal_places,
    values.min_lot,
    values.max_lot,
    values.lot_step,
    values.account_balance,
    values.stop_loss,
    values.target,
    values.trade_type,
  ])

  const updateTags = (value: string) => {
    setTagInput(value)
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10)
    setValue("tags", tags, { shouldDirty: true, shouldValidate: true })
  }

  const updateNewInstrumentType = (assetType: AssetType) => {
    setNewInstrument((current) => ({
      ...current,
      ...ASSET_TYPE_DEFAULTS[assetType],
    }))
  }

  const addInstrument = async () => {
    setAddingInstrument(true)
    try {
      const response = await authFetch("/api/instruments", {
        method: editingInstrument ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newInstrument),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to add symbol")

      setInstruments((current) =>
        editingInstrument
          ? current.map((item) =>
              item.symbol === data.instrument.symbol ? data.instrument : item,
            )
          : [...current, data.instrument],
      )
      setValue("instrument", data.instrument.symbol, {
        shouldDirty: true,
        shouldValidate: true,
      })
      setValue("asset_type", data.instrument.assetType)
      setValue("quantity_mode", getQuantityMode(data.instrument.assetType))
      setValue("base_currency", data.instrument.baseCurrency)
      setValue("contract_size", data.instrument.contractSize)
      setValue("tick_size", data.instrument.tickSize)
      setValue("tick_value", data.instrument.tickValue)
      setValue("pip_size", data.instrument.pipSize)
      setValue("quote_currency", data.instrument.quoteCurrency)
      setValue("decimal_places", data.instrument.decimalPlaces)
      setValue("min_lot", data.instrument.minLot)
      setValue("max_lot", data.instrument.maxLot)
      setValue("lot_step", data.instrument.lotStep)
      setNewInstrument({
        symbol: "",
        name: "",
        ...ASSET_TYPE_DEFAULTS.forex,
      })
      setInstrumentDialogOpen(false)
      setEditingInstrument(false)
      toast({
        title: editingInstrument ? "Specification updated" : "Symbol added",
        description: `${data.instrument.name} (${data.instrument.symbol}) is ready to use.`,
      })
    } catch (error) {
      toast({
        title: editingInstrument ? "Could not update specification" : "Could not add symbol",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setAddingInstrument(false)
    }
  }

  const onSubmit = async (data: TradeFormValues) => {
    try {
      const response = await authFetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const result = await response.json()

      if (!response.ok) {
        if (result.fields) {
          Object.entries(result.fields).forEach(([field, messages]) => {
            const message = Array.isArray(messages) ? messages[0] : undefined
            if (message) {
              setError(field as keyof TradeFormValues, { type: "server", message })
            }
          })
        }
        throw new Error(result.error || "Failed to save trade")
      }

      toast({
        title: "Trade saved",
        description: "Your journal entry is ready for review.",
      })
      router.push("/trades")
      router.refresh()
    } catch (error) {
      toast({
        title: "Could not save trade",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const resetForm = () => {
    reset({ ...defaultValues, entry_date: getLocalDateTime() })
    setTagInput("")
  }

  return (
    <div className="space-y-5">
      <HudPanel className="p-5 sm:p-6">
        <Link
          href="/trades"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-cyan-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Trade history
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="hud-label mb-2">New journal entry</p>
            <h1 className="text-2xl font-semibold tracking-tight text-cyan-100">Add a trade</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Capture the execution first, then add the context that will make the review useful.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Required fields are marked with *
          </div>
        </div>
      </HudPanel>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <HudPanel>
              <HudPanelHeader
                title="Trade details"
                description="Instrument, direction, timing, and execution"
                action={
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                }
              />
              <div className="space-y-6 p-5 sm:p-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="instrument">Instrument</FieldLabel>
                    <Controller
                      name="instrument"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value || undefined}
                          onValueChange={(value) => {
                            if (value === "__add_symbol__") {
                              setEditingInstrument(false)
                              setNewInstrument({
                                symbol: "",
                                name: "",
                                ...ASSET_TYPE_DEFAULTS.forex,
                              })
                              setInstrumentDialogOpen(true)
                              return
                            }
                            if (value === "__edit_symbol__") {
                              const selected = instruments.find(
                                (item) => item.symbol === field.value,
                              )
                              if (selected) {
                                const { isDefault: _isDefault, ...specification } = selected
                                setNewInstrument(specification)
                                setEditingInstrument(true)
                                setInstrumentDialogOpen(true)
                              }
                              return
                            }
                            field.onChange(value)
                            const instrument = instruments.find((item) => item.symbol === value)
                            if (instrument) {
                              setValue("asset_type", instrument.assetType)
                              setValue("quantity_mode", getQuantityMode(instrument.assetType))
                              setValue("base_currency", instrument.baseCurrency)
                              setValue("contract_size", instrument.contractSize)
                              setValue("tick_size", instrument.tickSize)
                              setValue("tick_value", instrument.tickValue)
                              setValue("pip_size", instrument.pipSize)
                              setValue("quote_currency", instrument.quoteCurrency)
                              setValue("decimal_places", instrument.decimalPlaces)
                              setValue("min_lot", instrument.minLot)
                              setValue("max_lot", instrument.maxLot)
                              setValue("lot_step", instrument.lotStep)
                            }
                          }}
                        >
                          <SelectTrigger
                            id="instrument"
                            className="h-11"
                            aria-invalid={Boolean(errors.instrument)}
                          >
                            <SelectValue placeholder="Select an instrument" />
                          </SelectTrigger>
                          <SelectContent>
                            {instruments.map((instrument) => (
                              <SelectItem key={instrument.symbol} value={instrument.symbol}>
                                <span className="flex items-center gap-2">
                                  <span className="font-medium">{instrument.symbol}</span>
                                  <span className="text-muted-foreground">— {instrument.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                            <SelectItem value="__add_symbol__" className="mt-1 border-t border-cyan-400/15 pt-2 text-primary">
                              <span className="flex items-center gap-2 font-medium">
                                <Plus className="h-4 w-4" />
                                Add new symbol
                              </span>
                            </SelectItem>
                            <SelectItem value="__edit_symbol__" disabled={!field.value}>
                              Edit selected broker spec
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldMessage message={errors.instrument?.message} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="order_type">Market type</FieldLabel>
                    <Controller
                      name="order_type"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="order_type" className="h-11" aria-invalid={Boolean(errors.order_type)}>
                            <SelectValue placeholder="Select market type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">Cash / Spot</SelectItem>
                            <SelectItem value="Futures">Futures</SelectItem>
                            <SelectItem value="Options">Options</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldMessage message={errors.order_type?.message} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="direction">Direction</FieldLabel>
                    <Controller
                      name="trade_type"
                      control={control}
                      render={({ field }) => (
                        <ToggleGroup
                          id="direction"
                          type="single"
                          value={field.value}
                          onValueChange={(value) => value && field.onChange(value)}
                          className="grid grid-cols-2 gap-2"
                        >
                          <ToggleGroupItem
                            value="Buy"
                            className="h-11 border data-[state=on]:border-emerald-500/60 data-[state=on]:bg-emerald-500/10 data-[state=on]:text-emerald-500"
                          >
                            <TrendingUp className="mr-2 h-4 w-4" />
                            Long
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value="Sell"
                            className="h-11 border data-[state=on]:border-rose-500/60 data-[state=on]:bg-rose-500/10 data-[state=on]:text-rose-500"
                          >
                            <TrendingDown className="mr-2 h-4 w-4" />
                            Short
                          </ToggleGroupItem>
                        </ToggleGroup>
                      )}
                    />
                    <FieldMessage message={errors.trade_type?.message} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="strategy" optional>Strategy / setup</FieldLabel>
                    <Input
                      id="strategy"
                      placeholder="e.g. Breakout retest"
                      className="h-11"
                      {...register("strategy")}
                    />
                    <FieldMessage message={errors.strategy?.message} />
                  </div>
                </div>

                <div className="border-t border-cyan-400/15 pt-6">
                  <p className="mb-4 text-sm font-semibold">Timing and execution</p>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="entry_date">Entry date &amp; time</FieldLabel>
                      <Input
                        id="entry_date"
                        type="datetime-local"
                        className="h-11"
                        aria-invalid={Boolean(errors.entry_date)}
                        {...register("entry_date")}
                      />
                      <FieldMessage message={errors.entry_date?.message} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="exit_date" optional>Exit date &amp; time</FieldLabel>
                      <Input
                        id="exit_date"
                        type="datetime-local"
                        className="h-11"
                        aria-invalid={Boolean(errors.exit_date)}
                        {...register("exit_date")}
                      />
                      <FieldMessage message={errors.exit_date?.message} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="entry_price">Entry price</FieldLabel>
                      <Input
                        id="entry_price"
                        type="number"
                        inputMode="decimal"
                        step={10 ** -Number(values.decimal_places || 2)}
                        min="0"
                        placeholder="0.00"
                        className="h-11"
                        aria-invalid={Boolean(errors.entry_price)}
                        {...register("entry_price")}
                      />
                      <FieldMessage message={errors.entry_price?.message} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="exit_price" optional>Exit price</FieldLabel>
                      <Input
                        id="exit_price"
                        type="number"
                        inputMode="decimal"
                        step={10 ** -Number(values.decimal_places || 2)}
                        min="0"
                        placeholder="Leave empty if trade is open"
                        className="h-11"
                        aria-invalid={Boolean(errors.exit_price)}
                        {...register("exit_price")}
                      />
                      <FieldMessage message={errors.exit_price?.message} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="quantity">
                        {values.quantity_mode === "lots" ? "Lot Size" : "Quantity"}
                      </FieldLabel>
                      <Input
                        id="quantity"
                        type="number"
                        inputMode="decimal"
                        step={Number(values.lot_step) || undefined}
                        min={Number(values.min_lot) || undefined}
                        max={Number(values.max_lot) || undefined}
                        placeholder={values.quantity_mode === "lots" ? "e.g. 0.10" : "e.g. 0.25"}
                        className="h-11"
                        aria-invalid={Boolean(errors.quantity)}
                        {...register("quantity")}
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Contract size: {Number(values.contract_size || 1).toLocaleString("en-US")}
                      </p>
                      <FieldMessage message={errors.quantity?.message} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="account_balance" optional>Account balance (USD)</FieldLabel>
                      <Input
                        id="account_balance"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="Required for risk %"
                        className="h-11"
                        {...register("account_balance")}
                      />
                      <FieldMessage message={errors.account_balance?.message} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel htmlFor="stop_loss" optional>Stop loss</FieldLabel>
                        <Input
                          id="stop_loss"
                          type="number"
                          inputMode="decimal"
                          step={10 ** -Number(values.decimal_places || 2)}
                          min="0"
                          placeholder="0.00"
                          className="h-11"
                          {...register("stop_loss")}
                        />
                        <FieldMessage message={errors.stop_loss?.message} />
                      </div>
                      <div>
                        <FieldLabel htmlFor="target" optional>Target</FieldLabel>
                        <Input
                          id="target"
                          type="number"
                          inputMode="decimal"
                          step={10 ** -Number(values.decimal_places || 2)}
                          min="0"
                          placeholder="0.00"
                          className="h-11"
                          {...register("target")}
                        />
                        <FieldMessage message={errors.target?.message} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-cyan-400/15 pt-6">
                  <FieldLabel htmlFor="setup_notes" optional>Setup notes</FieldLabel>
                  <Textarea
                    id="setup_notes"
                    placeholder="Why did you take this trade? Mention the setup, confirmation, and invalidation."
                    className="min-h-24 resize-y"
                    {...register("setup_notes")}
                  />
                  <FieldMessage message={errors.setup_notes?.message} />
                </div>
              </div>
            </HudPanel>

            <HudPanel>
              <HudPanelHeader
                title="Review and psychology"
                description="Optional context that improves future decisions"
                action={
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                }
              />
              <div className="space-y-6 p-5 sm:p-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="emotion_tag" optional>Emotion before entry</FieldLabel>
                    <Controller
                      name="emotion_tag"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger id="emotion_tag" className="h-11">
                            <SelectValue placeholder="Select an emotion" />
                          </SelectTrigger>
                          <SelectContent>
                            {["Calm", "Confident", "Focused", "Hesitant", "Fearful", "Greedy", "Frustrated"].map(
                              (emotion) => <SelectItem key={emotion} value={emotion}>{emotion}</SelectItem>,
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="mistake_tag" optional>Mistake tag</FieldLabel>
                    <Controller
                      name="mistake_tag"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger id="mistake_tag" className="h-11">
                            <SelectValue placeholder="No mistake identified" />
                          </SelectTrigger>
                          <SelectContent>
                            {["FOMO", "Early entry", "Late entry", "Overtrading", "Moved stop", "Revenge trade", "Oversized position"].map(
                              (mistake) => <SelectItem key={mistake} value={mistake}>{mistake}</SelectItem>,
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="confidence_rating" optional>Confidence</FieldLabel>
                    <Controller
                      name="confidence_rating"
                      control={control}
                      render={({ field }) => (
                        <div className="rounded-xl border border-cyan-400/15 px-4 py-3">
                          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Low</span>
                            <span className="font-semibold text-foreground">{field.value}/10</span>
                            <span>High</span>
                          </div>
                          <input
                            id="confidence_rating"
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={field.value}
                            onChange={(event) => field.onChange(Number(event.target.value))}
                            className="h-2 w-full cursor-pointer accent-primary"
                          />
                        </div>
                      )}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="followed_plan" optional>Did you follow your plan?</FieldLabel>
                    <Controller
                      name="followed_plan"
                      control={control}
                      render={({ field }) => (
                        <div id="followed_plan" className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className={cn("h-11", field.value && "border-emerald-500/60 bg-emerald-500/10 text-emerald-500")}
                            onClick={() => field.onChange(true)}
                          >
                            Yes, followed
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn("h-11", !field.value && "border-rose-500/60 bg-rose-500/10 text-rose-500")}
                            onClick={() => field.onChange(false)}
                          >
                            No, deviated
                          </Button>
                        </div>
                      )}
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="review_notes" optional>Post-trade review</FieldLabel>
                  <Textarea
                    id="review_notes"
                    placeholder="What went well? What would you do differently next time?"
                    className="min-h-24 resize-y"
                    {...register("review_notes")}
                  />
                  <FieldMessage message={errors.review_notes?.message} />
                </div>

                <div>
                  <FieldLabel htmlFor="tags" optional>Tags</FieldLabel>
                  <Input
                    id="tags"
                    value={tagInput}
                    onChange={(event) => updateTags(event.target.value)}
                    placeholder="London session, A+ setup, news (comma separated)"
                    className="h-11"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">Up to 10 tags, separated by commas.</p>
                  <FieldMessage message={errors.tags?.message} />
                </div>
              </div>
            </HudPanel>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <HudPanel>
              <HudPanelHeader
                title="Trade summary"
                action={<CircleDollarSign className="h-4 w-4 text-cyan-300" />}
              />
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-cyan-400/15 bg-[#05070a]/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Live P&amp;L</p>
                  <p
                    className={cn(
                      "mt-2 text-2xl font-semibold",
                      metrics.pnl === null
                        ? "text-muted-foreground"
                        : metrics.pnl >= 0
                          ? "text-emerald-400"
                          : "text-rose-400",
                    )}
                  >
                    {metrics.pnl === null
                      ? "—"
                      : `${metrics.pnl > 0 ? "+" : ""}${currency.format(metrics.pnl)}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {!values.trade_type
                      ? "Select Long or Short"
                      : !values.entry_price || !values.exit_price
                        ? "Enter entry and exit prices"
                        : metrics.pnl === null
                          ? "Enter a valid quantity"
                          : `Price difference × ${Number(values.quantity) || 0} ${values.quantity_mode} × ${Number(values.contract_size) || 0} contract`}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-cyan-400/15 p-3">
                    <p className="text-xs text-muted-foreground">Price move</p>
                    <p className="mt-2 text-sm font-semibold">
                      {metrics.difference === null
                        ? "—"
                        : `${metrics.difference > 0 ? "+" : ""}${metrics.difference.toFixed(Number(values.decimal_places) || 2)}`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-400/15 p-3">
                    <p className="text-xs text-muted-foreground">Pips</p>
                    <p className="mt-2 text-sm font-semibold">{metrics.pips ?? "—"}</p>
                  </div>
                  <div className="rounded-xl border border-cyan-400/15 p-3">
                    <p className="text-xs text-muted-foreground">Ticks</p>
                    <p className="mt-2 text-sm font-semibold">{metrics.ticks ?? "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-cyan-400/15 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span className="text-xs">Risk amount</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold">
                      {metrics.riskAmount !== null ? currency.format(metrics.riskAmount) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-400/15 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Target className="h-3.5 w-3.5" />
                      <span className="text-xs">Risk %</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold">
                      {metrics.riskPercentage !== null ? `${metrics.riskPercentage.toFixed(2)}%` : "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-cyan-400/15 p-3">
                    <p className="text-xs text-muted-foreground">R multiple</p>
                    <p className="mt-2 text-sm font-semibold">
                      {metrics.riskReward ? `${metrics.riskReward.toFixed(2)}R` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-400/15 p-3">
                    <p className="text-xs text-muted-foreground">Position value</p>
                    <p className="mt-2 text-sm font-semibold">
                      {metrics.positionValue !== null ? currency.format(metrics.positionValue) : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-cyan-400/15 p-3">
                  <span className="text-sm text-muted-foreground">Target reward</span>
                  <span className="font-semibold">
                    {metrics.reward !== null ? currency.format(metrics.reward) : "—"}
                  </span>
                </div>

                <div className="space-y-2 border-t border-cyan-400/15 pt-4 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Instrument</span>
                    <span className="max-w-36 truncate font-medium text-foreground">{values.instrument || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Broker spec</span>
                    <span className="font-medium text-foreground">
                      {instruments.find((item) => item.symbol === values.instrument)?.isDefault
                        ? "Default"
                        : values.instrument ? "Custom" : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Contract size</span>
                    <span className="font-medium text-foreground">{Number(values.contract_size) || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Pip / Tick size</span>
                    <span className="font-medium text-foreground">
                      {Number(values.pip_size) || "—"} / {Number(values.tick_size) || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{values.quantity_mode === "lots" ? "Lot size" : "Quantity"}</span>
                    <span className="font-medium text-foreground">{Number(values.quantity) || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Direction</span>
                    <span className="font-medium text-foreground">
                      {values.trade_type === "Buy" ? "Long" : values.trade_type === "Sell" ? "Short" : "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <Badge variant="outline" className="text-[10px]">
                      {values.exit_price ? "Closed" : "Open"}
                    </Badge>
                  </div>
                </div>
              </div>
            </HudPanel>

            <HudPanel className="p-4">
              <p className="text-sm font-medium">Before you save</p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {[
                  "Execution details are accurate",
                  "Risk and target reflect the original plan",
                  "Review notes are honest and actionable",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </HudPanel>
          </aside>
        </div>

        <div className="sticky bottom-0 z-20 mt-5 flex flex-col-reverse gap-3 rounded-2xl border border-border/70 bg-background/90 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {isDirty ? "You have unsaved changes." : "Start entering the trade details above."}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={resetForm} disabled={isSubmitting}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button type="submit" className="flex-1 sm:min-w-40" disabled={isSubmitting || instrumentsLoading}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isSubmitting ? "Saving..." : instrumentsLoading ? "Loading symbols..." : "Save trade"}
            </Button>
          </div>
        </div>
      </form>

      <Dialog open={instrumentDialogOpen} onOpenChange={setInstrumentDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingInstrument ? "Edit broker specification" : "Add a custom symbol"}
            </DialogTitle>
            <DialogDescription>
              {editingInstrument
                ? "Update the contract rules used by every calculation."
                : "Save an instrument once and it will remain available in your dropdown."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label htmlFor="new-symbol" className="mb-2 block">Symbol</Label>
              <Input
                id="new-symbol"
                value={newInstrument.symbol}
                onChange={(event) =>
                  setNewInstrument((current) => ({
                    ...current,
                    symbol: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="e.g. EURUSD"
                className="h-11 uppercase"
                maxLength={20}
                autoFocus
                disabled={editingInstrument}
              />
            </div>
            <div>
              <Label htmlFor="new-symbol-name" className="mb-2 block">Display name</Label>
              <Input
                id="new-symbol-name"
                value={newInstrument.name}
                onChange={(event) =>
                  setNewInstrument((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g. Euro / US Dollar"
                className="h-11"
                maxLength={50}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-asset-type" className="mb-2 block">Asset type</Label>
                <Select
                  value={newInstrument.assetType}
                  onValueChange={(value) => updateNewInstrumentType(value as AssetType)}
                >
                  <SelectTrigger id="new-asset-type" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forex">Forex</SelectItem>
                    <SelectItem value="metal">Metal</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="commodity">Commodity</SelectItem>
                    <SelectItem value="index">Index</SelectItem>
                    <SelectItem value="stock">Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="new-base-currency" className="mb-2 block">Base currency / asset</Label>
                <Input
                  id="new-base-currency"
                  value={newInstrument.baseCurrency}
                  onChange={(event) =>
                    setNewInstrument((current) => ({
                      ...current,
                      baseCurrency: event.target.value.toUpperCase(),
                    }))
                  }
                  className="h-11 uppercase"
                  maxLength={20}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-contract-size" className="mb-2 block">Contract size</Label>
                <Input
                  id="new-contract-size"
                  type="number"
                  min="0"
                  step="any"
                  value={newInstrument.contractSize}
                  onChange={(event) =>
                    setNewInstrument((current) => ({
                      ...current,
                      contractSize: Number(event.target.value),
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div>
                <Label htmlFor="new-tick-size" className="mb-2 block">Tick size</Label>
                <Input
                  id="new-tick-size"
                  type="number"
                  min="0"
                  step="any"
                  value={newInstrument.tickSize}
                  onChange={(event) =>
                    setNewInstrument((current) => ({
                      ...current,
                      tickSize: Number(event.target.value),
                    }))
                  }
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-tick-value" className="mb-2 block">Tick value</Label>
                <Input
                  id="new-tick-value"
                  type="number"
                  min="0"
                  step="any"
                  value={newInstrument.tickValue}
                  onChange={(event) =>
                    setNewInstrument((current) => ({
                      ...current,
                      tickValue: Number(event.target.value),
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div>
                <Label htmlFor="new-pip-size" className="mb-2 block">Pip size</Label>
                <Input
                  id="new-pip-size"
                  type="number"
                  min="0"
                  step="any"
                  value={newInstrument.pipSize}
                  onChange={(event) =>
                    setNewInstrument((current) => ({
                      ...current,
                      pipSize: Number(event.target.value),
                    }))
                  }
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ["minLot", "Minimum size"],
                ["maxLot", "Maximum size"],
                ["lotStep", "Size step"],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <Label htmlFor={`new-${field}`} className="mb-2 block">{label}</Label>
                  <Input
                    id={`new-${field}`}
                    type="number"
                    min="0"
                    step="any"
                    value={newInstrument[field]}
                    onChange={(event) =>
                      setNewInstrument((current) => ({
                        ...current,
                        [field]: Number(event.target.value),
                      }))
                    }
                    className="h-11"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-quote-currency" className="mb-2 block">Quote currency</Label>
                <Input
                  id="new-quote-currency"
                  value={newInstrument.quoteCurrency}
                  onChange={(event) =>
                    setNewInstrument((current) => ({
                      ...current,
                      quoteCurrency: event.target.value.toUpperCase(),
                    }))
                  }
                  className="h-11 uppercase"
                  maxLength={10}
                />
              </div>
              <div>
                <Label htmlFor="new-decimals" className="mb-2 block">Decimal places</Label>
                <Input
                  id="new-decimals"
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  value={newInstrument.decimalPlaces}
                  onChange={(event) =>
                    setNewInstrument((current) => ({
                      ...current,
                      decimalPlaces: Number(event.target.value),
                    }))
                  }
                  className="h-11"
                />
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              These values control pip/tick movement and P&amp;L. Match them with your broker&apos;s contract specifications.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInstrumentDialogOpen(false)}
              disabled={addingInstrument}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={addInstrument}
              disabled={
                addingInstrument ||
                newInstrument.symbol.trim().length < 2 ||
                newInstrument.name.trim().length < 2 ||
                newInstrument.contractSize <= 0 ||
                newInstrument.tickSize <= 0 ||
                newInstrument.tickValue <= 0 ||
                newInstrument.pipSize <= 0 ||
                newInstrument.quoteCurrency.trim().length < 3 ||
                newInstrument.baseCurrency.trim().length < 1 ||
                newInstrument.minLot <= 0 ||
                newInstrument.maxLot < newInstrument.minLot ||
                newInstrument.lotStep <= 0
              }
            >
              {addingInstrument && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {addingInstrument
                ? editingInstrument ? "Saving..." : "Adding..."
                : editingInstrument ? "Save specification" : "Add symbol"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
