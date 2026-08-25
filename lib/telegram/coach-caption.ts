import type { TradeMomentAdvice } from "@/lib/trading/trade-moment-advice"
import {
  buildTelegramTradeMessage,
  type TelegramTradeEvent,
} from "@/lib/telegram/send-trade-alert"

const CAPTION_MAX = 1024

function resultLine(event: TelegramTradeEvent, advice: TradeMomentAdvice) {
  if (event.kind === "close" && typeof event.netPnl === "number" && Number.isFinite(event.netPnl)) {
    if (event.netPnl > 0) return [`RESULT: WIN`, advice.headline]
    if (event.netPnl < 0) return [`RESULT: LOSS`, advice.headline]
    return [`RESULT: BREAKEVEN`, advice.headline]
  }

  if (advice.verdict === "skip" || advice.overallZone === "red") {
    const weak =
      advice.hour.zone === "Weak"
        ? `Weak hour — ${advice.hour.label}`
        : advice.day.zone === "Weak"
          ? `Weak day — ${advice.day.label}`
          : advice.session.zone === "Weak"
            ? `Weak session — ${advice.session.label}`
            : advice.headline
    return [`RESULT: SKIP`, weak]
  }
  if (advice.verdict === "caution" || advice.overallZone === "yellow") {
    return [`RESULT: RISKY`, advice.headline]
  }
  return [`RESULT: GO`, advice.headline]
}

function bucketLine(kind: string, bucket: { label: string; zone: string; summary: string }) {
  return `${kind} ${bucket.label} — ${bucket.zone.toUpperCase()}\n${bucket.summary}`
}

export function buildTelegramCoachCaption(event: TelegramTradeEvent, advice: TradeMomentAdvice | null) {
  const header = buildTelegramTradeMessage(event)
  if (!advice) return header.slice(0, CAPTION_MAX)

  const lines = [
    header,
    "",
    ...resultLine(event, advice),
    "",
    bucketLine("Hour", advice.hour),
    bucketLine("Day", advice.day),
    bucketLine("Session", advice.session),
    "",
    advice.action,
  ]

  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n")
  if (text.length <= CAPTION_MAX) return text

  const short = [header, "", ...resultLine(event, advice), "", advice.action].join("\n")
  return short.slice(0, CAPTION_MAX)
}
