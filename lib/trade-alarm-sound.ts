import {
  getTradeAlarmSound,
  type TradeAlarmSoundId,
  type TradeAlarmSoundMode,
} from "@/lib/new-trade-alarm-settings"

let activeAudio: HTMLAudioElement | null = null

function stopActiveAudio() {
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

/** @deprecated Use stopTradeAlarmSound */
export function stopRepeatingTradeAlarm(_timerId: number | null) {
  stopTradeAlarmSound()
}

function startAudio(audio: HTMLAudioElement) {
  activeAudio = audio
  void audio.play().catch(() => {
    stopActiveAudio()
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
