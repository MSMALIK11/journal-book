export type TradeAlarmSoundMode = "once" | "manual"

export type TradeAlarmSoundId =
  | "urgent-simple-tone-loop"
  | "classic-alarm"

export type TradeAlarmSoundOption = {
  id: TradeAlarmSoundId
  name: string
  description: string
  src: string
  /** Native loop works well in repeat mode */
  loopFriendly: boolean
}

export const TRADE_ALARM_SOUNDS: TradeAlarmSoundOption[] = [
  {
    id: "urgent-simple-tone-loop",
    name: "Urgent simple tone loop",
    description: "Continuous urgent tone — best for repeat mode.",
    src: "/sounds/alarms/urgent-simple-tone-loop.mp3",
    loopFriendly: true,
  },
  {
    id: "classic-alarm",
    name: "Classic alarm",
    description: "Traditional alarm clock style ring.",
    src: "/sounds/alarms/classic-alarm.mp3",
    loopFriendly: false,
  },
]

export function getTradeAlarmSound(id: TradeAlarmSoundId): TradeAlarmSoundOption {
  return TRADE_ALARM_SOUNDS.find((sound) => sound.id === id) ?? TRADE_ALARM_SOUNDS[0]
}

export type TradeAlarmPreferences = {
  enabled: boolean
  soundMode: TradeAlarmSoundMode
  soundId: TradeAlarmSoundId
}

export const DEFAULT_TRADE_ALARM_PREFERENCES: TradeAlarmPreferences = {
  enabled: true,
  soundMode: "manual",
  soundId: "urgent-simple-tone-loop",
}

export function normalizeTradeAlarmPreferences(
  prefs: Partial<TradeAlarmPreferences> | null | undefined,
): TradeAlarmPreferences {
  const merged = { ...DEFAULT_TRADE_ALARM_PREFERENCES, ...prefs }
  const validIds = new Set(TRADE_ALARM_SOUNDS.map((sound) => sound.id))
  if (!validIds.has(merged.soundId)) {
    merged.soundId = DEFAULT_TRADE_ALARM_PREFERENCES.soundId
  }
  return merged
}
