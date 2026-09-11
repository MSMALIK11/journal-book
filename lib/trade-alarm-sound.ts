import {
  getTradeAlarmSound,
  type TradeAlarmSoundId,
  type TradeAlarmSoundMode,
} from "@/lib/new-trade-alarm-settings"

let activeAudio: HTMLAudioElement | null = null
let audioUnlocked = false
let gestureRetry: (() => void) | null = null

function clearGestureRetry() {
  if (!gestureRetry) return
  window.removeEventListener("pointerdown", gestureRetry, true)
  window.removeEventListener("keydown", gestureRetry, true)
  gestureRetry = null
}

/**
 * Autoplay policy blocks sound until the page has been interacted with, which
 * silently swallowed alarms on tabs the user never clicked. Ring the moment they
 * do interact instead of dropping the alarm.
 */
function retrySoundOnNextGesture(audio: HTMLAudioElement) {
  clearGestureRetry()
  const retry = () => {
    clearGestureRetry()
    if (activeAudio !== audio) return
    audioUnlocked = true
    void audio.play().catch(() => {})
  }
  gestureRetry = retry
  window.addEventListener("pointerdown", retry, { capture: true, once: true })
  window.addEventListener("keydown", retry, { capture: true, once: true })
}

function stopActiveAudio() {
  clearGestureRetry()
  if (!activeAudio) return
  activeAudio.pause()
  activeAudio.currentTime = 0
  activeAudio.loop = false
  activeAudio.onended = null
  activeAudio = null
}

export function stopTradeAlarmSound() {
  stopActiveAudio()
}

/** Call after a user gesture so later alarms are not blocked by autoplay policy. */
export async function unlockTradeAlarmAudio() {
  if (typeof window === "undefined" || audioUnlocked) return
  try {
    const silent = new Audio()
    silent.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
    silent.volume = 0.01
    await silent.play()
    silent.pause()
    audioUnlocked = true
  } catch {
    // Still blocked — next gesture / play attempt will retry.
  }
}

/** @deprecated Use stopTradeAlarmSound */
export function stopRepeatingTradeAlarm(_timerId: number | null) {
  stopTradeAlarmSound()
}

function startAudio(audio: HTMLAudioElement) {
  activeAudio = audio
  void audio.play().catch(() => {
    if (activeAudio !== audio) return
    retrySoundOnNextGesture(audio)
  })
}

export function playTradeAlarmSound(soundId: TradeAlarmSoundId, mode: TradeAlarmSoundMode) {
  stopTradeAlarmSound()

  if (typeof window === "undefined") return

  const sound = getTradeAlarmSound(soundId)
  const audio = new Audio(sound.src)
  audio.volume = 0.9
  audio.preload = "auto"

  if (mode === "manual") {
    if (sound.loopFriendly) {
      audio.loop = true
    } else {
      audio.onended = () => {
        if (activeAudio !== audio) return
        audio.currentTime = 0
        void audio.play().catch(() => {})
      }
    }
    startAudio(audio)
    return
  }

  startAudio(audio)
}

/** @deprecated Use playTradeAlarmSound */
export function playTradeAlarmBeep() {
  playTradeAlarmSound("urgent-simple-tone-loop", "once")
}

/** @deprecated Use playTradeAlarmSound */
export function startRepeatingTradeAlarm(_intervalMs?: number) {
  playTradeAlarmSound("urgent-simple-tone-loop", "manual")
  return -1
}

/** @deprecated */
export const TRADE_ALARM_REPEAT_MS = 1200
