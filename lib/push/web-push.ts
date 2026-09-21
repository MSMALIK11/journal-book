import "server-only"

import webpush from "web-push"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

export type PushSubscriptionRecord = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userAgent?: string
  createdAt?: Date
}

export type TradePushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

let configured = false

function ensureConfigured() {
  if (configured) return true
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim()
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim()
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:support@tradingjournal.local"
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export function getWebPushPublicKey() {
  return process.env.WEB_PUSH_PUBLIC_KEY?.trim() || null
}

export function isWebPushConfigured() {
  return Boolean(getWebPushPublicKey() && process.env.WEB_PUSH_PRIVATE_KEY?.trim())
}

export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionRecord,
) {
  await connectDB()
  await User.updateOne(
    { _id: userId },
    {
      $pull: { pushSubscriptions: { endpoint: subscription.endpoint } },
    },
  )
  await User.updateOne(
    { _id: userId },
    {
      $push: {
        pushSubscriptions: {
          ...subscription,
          createdAt: new Date(),
        },
      },
    },
  )
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await connectDB()
  await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint } } })
}

export async function sendTradePushToUser(userId: string, payload: TradePushPayload) {
  if (!ensureConfigured()) return { sent: 0, failed: 0, skipped: true }

  await connectDB()
  const user = await User.findById(userId).select("pushSubscriptions").lean()
  const subscriptions = (user?.pushSubscriptions || []) as PushSubscriptionRecord[]
  if (!subscriptions.length) return { sent: 0, failed: 0, skipped: false }

  let sent = 0
  let failed = 0
  const stale: string[] = []

  for (const record of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: record.endpoint,
          keys: record.keys,
        },
        JSON.stringify(payload),
      )
      sent += 1
    } catch (error) {
      failed += 1
      const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0
      if (status === 404 || status === 410) stale.push(record.endpoint)
    }
  }

  if (stale.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { pushSubscriptions: { endpoint: { $in: stale } } } },
    )
  }

  return { sent, failed, skipped: false }
}
