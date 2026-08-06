"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useTradeSyncListener, type TradeSyncEventDetail } from "@/hooks/use-trade-sync-listener"

type TradeSyncListener = (detail: TradeSyncEventDetail) => void

type TradeSyncContextValue = {
  subscribe: (listener: TradeSyncListener) => () => void
  sseConnected: boolean
}

const TradeSyncContext = createContext<TradeSyncContextValue | null>(null)

/** Single SSE/DOM/poll connection — subscribers avoid opening duplicate streams. */
export function TradeSyncProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<TradeSyncListener>())
  const [sseConnected, setSseConnected] = useState(false)

  useTradeSyncListener({
    onEvent: (detail) => {
      for (const listener of listenersRef.current) {
        listener(detail)
      }
    },
    onConnectionChange: setSseConnected,
  })

  const subscribe = (listener: TradeSyncListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }

  return (
    <TradeSyncContext.Provider value={{ subscribe, sseConnected }}>{children}</TradeSyncContext.Provider>
  )
}

export function useTradeSyncConnection() {
  return useContext(TradeSyncContext)?.sseConnected ?? false
}

export function useTradeSyncEvent(onEvent: (detail: TradeSyncEventDetail) => void) {
  const context = useContext(TradeSyncContext)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!context) return
    return context.subscribe((detail) => onEventRef.current(detail))
  }, [context])
}
