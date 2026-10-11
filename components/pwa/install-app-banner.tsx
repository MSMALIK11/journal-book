"use client"

import { useCallback, useEffect, useState } from "react"
import { Share, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isIOSDevice, isStandalonePwa } from "@/lib/pwa/client"
import { cn } from "@/lib/utils"

const DISMISS_KEY = "jb-pwa-install-dismissed-v1"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function InstallAppBanner() {
  const [visible, setVisible] = useState(false)
  const [ios, setIos] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isStandalonePwa()) return
    if (localStorage.getItem(DISMISS_KEY) === "1") return

    setIos(isIOSDevice())
    setVisible(true)

    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall)
  }, [])

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1")
    setVisible(false)
  }, [])

  async function installAndroid() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
  }

  if (!visible) return null

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[90] px-4 lg:hidden",
        "pointer-events-none",
      )}
    >
      <div className="pointer-events-auto mx-auto max-w-lg rounded-xl border border-cyan-400/25 bg-[#0a1018]/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-2 text-cyan-300">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Install for faster alerts</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {ios ? (
                <>
                  Tap <Share className="mx-0.5 inline h-3.5 w-3.5" /> Share →{" "}
                  <strong className="text-foreground/90">Add to Home Screen</strong>, then open from the icon and
                  enable push in Settings.
                </>
              ) : deferredPrompt ? (
                "Install the app to get background trade alerts with vibration."
              ) : (
                "Use your browser menu → Install app, or Add to Home Screen for background alerts."
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!ios && deferredPrompt ? (
                <Button type="button" size="sm" onClick={() => void installAndroid()}>
                  Install app
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={dismiss}>
                Got it
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss install hint"
            className="rounded-md p-1 text-muted-foreground hover:bg-cyan-400/10 hover:text-foreground"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
