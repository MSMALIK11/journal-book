"use client"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  } catch {
    return null
  }
}

export async function refreshSessionCookie() {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
    return response.ok
  } catch {
    return false
  }
}

export async function subscribeToPushAlerts() {
  if (typeof window === "undefined") {
    return { ok: false, error: "Browser unavailable" }
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, error: "Notifications are not supported on this device" }
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission denied" }
  }

  const registration = (await navigator.serviceWorker.ready) || (await registerServiceWorker())
  if (!registration) {
    return { ok: false, error: "Could not register the app worker" }
  }

  const keyResponse = await fetch("/api/push/vapid-public-key")
  const keyData = await keyResponse.json()
  if (!keyResponse.ok || !keyData.publicKey) {
    return { ok: false, error: keyData.error || "Push is not configured on the server" }
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, error: "Invalid push subscription" }
  }

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    return { ok: false, error: data.error || "Could not save push subscription" }
  }

  return { ok: true }
}

export async function unsubscribeFromPushAlerts() {
  if (!("serviceWorker" in navigator)) return { ok: true }
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return { ok: true }

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  })
  return { ok: true }
}

export function pushPermissionState() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  return Notification.permission
}
