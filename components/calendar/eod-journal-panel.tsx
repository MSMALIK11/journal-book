"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { BookOpen, Check, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/client-auth"
import {
  buildDayJournalDraftHints,
  buildDayJournalSnapshot,
  isDayJournalEmpty,
  type DayJournalSnapshot,
} from "@/lib/trading/day-journal-snapshot"
import { cn } from "@/lib/utils"

type ProcessFollowed = "yes" | "partial" | "no"
type DayGrade = "A" | "B" | "C" | "D" | "F"

type JournalFields = {
  whatWentWell: string
  whatWentWrong: string
  lessonsLearned: string
  marketRead: string
  tomorrowPlan: string
  processFollowed: ProcessFollowed | null
  dayGrade: DayGrade | null
}

type JournalTrade = {
  instrument: string
  entry_date: string
  exit_date?: string | null
  net_pnl: number | null
}

type AvoidKeyLists = {
  hours: Array<{ key: string }>
  sessions: Array<{ key: string }>
  days: Array<{ key: string }>
}

type JournalApiResponse = {
  journal: (JournalFields & { tags?: string[]; updatedAt?: string | null }) | null
  snapshot?: DayJournalSnapshot
  error?: string
}

const EMPTY_FIELDS: JournalFields = {
  whatWentWell: "",
  whatWentWrong: "",
  lessonsLearned: "",
  marketRead: "",
  tomorrowPlan: "",
  processFollowed: null,
  dayGrade: null,
}

const PROMPTS: Array<{
  key: keyof Pick<
    JournalFields,
    "whatWentWell" | "whatWentWrong" | "lessonsLearned" | "marketRead" | "tomorrowPlan"
  >
  label: string
  placeholder: string
}> = [
  {
    key: "whatWentWell",
    label: "What went well today?",
    placeholder: "Setups/sessions you executed well…",
  },
  {
    key: "whatWentWrong",
    label: "What went wrong / what not to repeat?",
    placeholder: "Mistakes, revenge, weak windows…",
  },
  {
    key: "lessonsLearned",
    label: "Lesson from today’s trades?",
    placeholder: "One durable rule from today…",
  },
  {
    key: "marketRead",
    label: "How did the market behave?",
    placeholder: "Trend, chop, session character…",
  },
  {
    key: "tomorrowPlan",
    label: "Plan for tomorrow?",
    placeholder: "What to do / not do next session…",
  },
]

const PROCESS_OPTIONS: Array<{ value: ProcessFollowed; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "partial", label: "Partial" },
  { value: "no", label: "No" },
]

const GRADE_OPTIONS: DayGrade[] = ["A", "B", "C", "D", "F"]

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatSignedPnl(value: number) {
  const formatted = currency.format(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

function fieldsEqual(a: JournalFields, b: JournalFields) {
  return (
    a.whatWentWell === b.whatWentWell &&
    a.whatWentWrong === b.whatWentWrong &&
    a.lessonsLearned === b.lessonsLearned &&
    a.marketRead === b.marketRead &&
    a.tomorrowPlan === b.tomorrowPlan &&
    a.processFollowed === b.processFollowed &&
    a.dayGrade === b.dayGrade
  )
}

function SnapshotStrip({ snapshot }: { snapshot: DayJournalSnapshot }) {
  const chips: string[] = []

  chips.push(
    snapshot.tradeCount === 0
      ? "0 trades"
      : `${snapshot.tradeCount} trade${snapshot.tradeCount === 1 ? "" : "s"}`,
  )
  chips.push(`Net ${formatSignedPnl(snapshot.netPnl)}`)

  if (snapshot.wins + snapshot.losses > 0) {
    chips.push(`${snapshot.wins}W / ${snapshot.losses}L`)
    if (snapshot.winRate != null) {
      chips.push(`${Math.round(snapshot.winRate * 100)}% WR`)
    }
  }

  if (snapshot.sessions.length > 0) {
    chips.push(
      snapshot.sessions.map((session) => `${session.label}×${session.count}`).join(" · "),
    )
  }

  if (snapshot.weakHourCount > 0) {
    chips.push(`${snapshot.weakHourCount} weak hour`)
  }
  if (snapshot.weakSessionCount > 0) {
    chips.push(`${snapshot.weakSessionCount} weak session`)
  }

  if (snapshot.bestTrade) {
    chips.push(`Best ${snapshot.bestTrade.instrument} ${formatSignedPnl(snapshot.bestTrade.pnl)}`)
  }
  if (
    snapshot.worstTrade &&
    (!snapshot.bestTrade ||
      snapshot.worstTrade.instrument !== snapshot.bestTrade.instrument ||
      snapshot.worstTrade.pnl !== snapshot.bestTrade.pnl)
  ) {
    chips.push(`Worst ${snapshot.worstTrade.instrument} ${formatSignedPnl(snapshot.worstTrade.pnl)}`)
  }

  if (snapshot.avgHoldLabel) {
    chips.push(`Avg hold ${snapshot.avgHoldLabel}`)
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Badge
          key={chip}
          variant="outline"
          className="h-6 border-border/70 bg-muted/30 px-2 text-[11px] font-medium text-muted-foreground"
        >
          {chip}
        </Badge>
      ))}
    </div>
  )
}

type EodJournalPanelProps = {
  dateKey: string
  accountId: string | null
  selectedTrades: JournalTrade[]
  timezone: string
  avoid?: AvoidKeyLists | null
  onDirtyChange?: (dirty: boolean) => void
}

export function EodJournalPanel({
  dateKey,
  accountId,
  selectedTrades,
  timezone,
  avoid,
  onDirtyChange,
}: EodJournalPanelProps) {
  const [fields, setFields] = useState<JournalFields>(EMPTY_FIELDS)
  const [savedFields, setSavedFields] = useState<JournalFields>(EMPTY_FIELDS)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [justSaved, setJustSaved] = useState(false)
  const [isAutofill, setIsAutofill] = useState(false)
  const appliedDataKeyRef = useRef<string | null>(null)
  const lastAutofillFingerprintRef = useRef<string | null>(null)
  const userEditedRef = useRef(false)

  const contextKey = accountId ? `${accountId}:${dateKey}` : null

  const snapshot = useMemo(
    () => buildDayJournalSnapshot(selectedTrades, avoid, timezone),
    [selectedTrades, avoid, timezone],
  )

  const snapshotFingerprint = useMemo(
    () =>
      JSON.stringify({
        tradeCount: snapshot.tradeCount,
        netPnl: snapshot.netPnl,
        wins: snapshot.wins,
        losses: snapshot.losses,
        weakHourCount: snapshot.weakHourCount,
        weakSessionCount: snapshot.weakSessionCount,
        sessions: snapshot.sessions,
        bestTrade: snapshot.bestTrade,
        worstTrade: snapshot.worstTrade,
        avgHoldLabel: snapshot.avgHoldLabel,
      }),
    [snapshot],
  )

  const { data, error, isLoading, mutate } = useSWR<JournalApiResponse>(
    contextKey
      ? `/api/journal/day?date=${dateKey}&account=${accountId}&timezone=${encodeURIComponent(timezone)}`
      : null,
    async (url: string) => {
      const response = await authFetch(url)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Failed to load journal")
      return payload as JournalApiResponse
    },
    { revalidateOnFocus: false },
  )

  const dirty = !fieldsEqual(fields, savedFields)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!contextKey) return
    if (isLoading && !data) return

    const dataKey = `${contextKey}:${data?.journal?.updatedAt ?? "empty"}`
    if (appliedDataKeyRef.current === dataKey) return
    appliedDataKeyRef.current = dataKey
    lastAutofillFingerprintRef.current = null
    userEditedRef.current = false
    setSaveError("")
    setJustSaved(false)

    const loaded: JournalFields = data?.journal
      ? {
          whatWentWell: data.journal.whatWentWell ?? "",
          whatWentWrong: data.journal.whatWentWrong ?? "",
          lessonsLearned: data.journal.lessonsLearned ?? "",
          marketRead: data.journal.marketRead ?? "",
          tomorrowPlan: data.journal.tomorrowPlan ?? "",
          processFollowed: data.journal.processFollowed ?? null,
          dayGrade: data.journal.dayGrade ?? null,
        }
      : { ...EMPTY_FIELDS }

    setSavedFields(loaded)

    if (isDayJournalEmpty(loaded)) {
      const hints = buildDayJournalDraftHints(snapshot)
      const autofilled: JournalFields = {
        ...loaded,
        whatWentWell: hints.whatWentWell ?? "",
        whatWentWrong: hints.whatWentWrong ?? "",
        lessonsLearned: hints.lessonsLearned ?? "",
        marketRead: hints.marketRead ?? "",
        tomorrowPlan: hints.tomorrowPlan ?? "",
        processFollowed: hints.processFollowed ?? null,
        dayGrade: hints.dayGrade ?? null,
      }
      setFields(autofilled)
      setIsAutofill(true)
      lastAutofillFingerprintRef.current = snapshotFingerprint
      return
    }

    setFields(loaded)
    setIsAutofill(false)
  }, [contextKey, data, isLoading, snapshot, snapshotFingerprint])

  // Refresh autofill if trade snapshot updates and the user hasn't edited yet.
  useEffect(() => {
    if (!contextKey || !isAutofill || userEditedRef.current) return
    if (!isDayJournalEmpty(savedFields)) return
    if (lastAutofillFingerprintRef.current === snapshotFingerprint) return

    const hints = buildDayJournalDraftHints(snapshot)
    setFields({
      whatWentWell: hints.whatWentWell ?? "",
      whatWentWrong: hints.whatWentWrong ?? "",
      lessonsLearned: hints.lessonsLearned ?? "",
      marketRead: hints.marketRead ?? "",
      tomorrowPlan: hints.tomorrowPlan ?? "",
      processFollowed: hints.processFollowed ?? null,
      dayGrade: hints.dayGrade ?? null,
    })
    lastAutofillFingerprintRef.current = snapshotFingerprint
  }, [contextKey, isAutofill, savedFields, snapshot, snapshotFingerprint])

  async function handleSave() {
    if (!accountId || !contextKey) return
    setSaving(true)
    setSaveError("")
    setJustSaved(false)
    try {
      const response = await authFetch("/api/journal/day", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateKey,
          accountId,
          ...fields,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Failed to save journal")

      const next: JournalFields = {
        whatWentWell: payload.journal?.whatWentWell ?? fields.whatWentWell,
        whatWentWrong: payload.journal?.whatWentWrong ?? fields.whatWentWrong,
        lessonsLearned: payload.journal?.lessonsLearned ?? fields.lessonsLearned,
        marketRead: payload.journal?.marketRead ?? fields.marketRead,
        tomorrowPlan: payload.journal?.tomorrowPlan ?? fields.tomorrowPlan,
        processFollowed: payload.journal?.processFollowed ?? fields.processFollowed,
        dayGrade: payload.journal?.dayGrade ?? fields.dayGrade,
      }
      setFields(next)
      setSavedFields(next)
      setIsAutofill(false)
      userEditedRef.current = false
      setJustSaved(true)
      await mutate(
        {
          journal: {
            ...next,
            tags: payload.journal?.tags ?? [],
            updatedAt: payload.journal?.updatedAt ?? new Date().toISOString(),
          },
          snapshot: data?.snapshot,
        },
        false,
      )
      window.setTimeout(() => setJustSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save journal")
    } finally {
      setSaving(false)
    }
  }

  function updateField<K extends keyof JournalFields>(key: K, value: JournalFields[K]) {
    userEditedRef.current = true
    setIsAutofill(false)
    setFields((prev) => ({ ...prev, [key]: value }))
    setJustSaved(false)
  }

  return (
    <div className="mt-5 rounded-xl border border-border/60 bg-muted/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold tracking-tight">End of day journal</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAutofill
              ? "Auto-filled from today’s trades — edit anything, then save."
              : "Close the book on this day — process over P&amp;L."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {isAutofill ? "Draft · unsaved" : "Unsaved"}
            </span>
          ) : justSaved ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null}
          <Button size="sm" onClick={handleSave} disabled={!accountId || saving || !dirty}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <SnapshotStrip snapshot={snapshot} />
      </div>

      {(isLoading && !data) || error ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {error ? (error instanceof Error ? error.message : "Failed to load journal") : "Loading journal…"}
        </p>
      ) : null}

      {saveError ? <p className="mt-2 text-xs text-rose-500">{saveError}</p> : null}

      <div className="mt-4 grid gap-3">
        {PROMPTS.map((prompt) => (
          <label key={prompt.key} className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground/90">{prompt.label}</span>
            <Textarea
              value={fields[prompt.key]}
              onChange={(event) => updateField(prompt.key, event.target.value)}
              placeholder={prompt.placeholder}
              className="min-h-[72px] resize-y bg-background/60"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground/90">Followed process?</p>
          <div className="flex flex-wrap gap-1.5">
            {PROCESS_OPTIONS.map((option) => {
              const active = fields.processFollowed === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    updateField("processFollowed", active ? null : option.value)
                  }
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-foreground/30 bg-foreground text-background"
                      : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground/90">Day grade</p>
          <div className="flex flex-wrap gap-1.5">
            {GRADE_OPTIONS.map((grade) => {
              const active = fields.dayGrade === grade
              return (
                <button
                  key={grade}
                  type="button"
                  onClick={() => updateField("dayGrade", active ? null : grade)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                    active
                      ? "border-foreground/30 bg-foreground text-background"
                      : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {grade}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
