import mongoose from "mongoose"
import BrokerCredential from "@/app/api/models/BrokerCredential"
import User from "@/app/api/models/User"
import { decryptSecret, encryptSecret } from "@/lib/encryption"
import {
  applyExecutionEnabled,
  maskAccountLogin,
  normalizeExecutionPreferences,
  XM_CREDENTIAL_LABEL,
  type BrokerConfigPublic,
  type BrokerConnectionPublic,
  type BrokerConnectionStatus,
  type BrokerName,
  type BrokerPlatform,
  type BrokerExecutionPreferences,
} from "@/lib/broker/broker-config"

const XM_QUERY = {
  provider: "xm" as const,
  label: XM_CREDENTIAL_LABEL,
}

export type SaveBrokerConfigInput = {
  broker: BrokerName
  platform: BrokerPlatform
  login: string
  server: string
  password?: string
  execution: BrokerExecutionPreferences
  connectionStatus?: BrokerConnectionStatus
  lastMessage?: string | null
}

function emptyConnection(): BrokerConnectionPublic {
  return {
    configured: false,
    hasPassword: false,
    broker: "xm",
    platform: "mt5",
    login: "",
    loginMasked: "****",
    server: "",
    status: "not_connected",
    lastCheckedAt: null,
    lastMessage: null,
  }
}

function toPublicConnection(doc: {
  encryptedKey?: string
  encryptedSecret?: string
  lastFour?: string
  server?: string
  platform?: string
  lastConnectionStatus?: string
  lastCheckedAt?: Date
  lastConnectionMessage?: string | null
  brokerName?: string
}): BrokerConnectionPublic {
  let login = ""
  try {
    login = doc.encryptedKey ? decryptSecret(doc.encryptedKey) : ""
  } catch {
    login = ""
  }
  const status = (doc.lastConnectionStatus as BrokerConnectionStatus | undefined) ?? "not_connected"
  const broker: BrokerName = doc.brokerName === "other" ? "other" : "xm"
  return {
    configured: Boolean(doc.encryptedSecret),
    hasPassword: Boolean(doc.encryptedSecret),
    broker,
    platform: "mt5",
    login,
    loginMasked: login ? maskAccountLogin(login) : doc.lastFour ? `****${doc.lastFour}` : "****",
    server: doc.server ?? "",
    status: ["not_connected", "connecting", "connected", "error", "unavailable"].includes(status)
      ? status
      : "not_connected",
    lastCheckedAt: doc.lastCheckedAt ? doc.lastCheckedAt.toISOString() : null,
    lastMessage: doc.lastConnectionMessage ?? null,
  }
}

export async function loadBrokerConfig(userId: string): Promise<BrokerConfigPublic> {
  const userObjectId = new mongoose.Types.ObjectId(userId)
  const [doc, user] = await Promise.all([
    BrokerCredential.findOne({ userId: userObjectId, ...XM_QUERY }),
    User.findById(userObjectId).select("brokerExecutionPreferences").lean(),
  ])

  return {
    connection: doc ? toPublicConnection(doc) : emptyConnection(),
    execution: normalizeExecutionPreferences(user?.brokerExecutionPreferences),
  }
}

export async function getXmCredentialsForWorker(userId: string): Promise<{
  login: string
  password: string
  server: string
} | null> {
  const doc = await BrokerCredential.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    ...XM_QUERY,
  })
  if (!doc?.encryptedKey || !doc.encryptedSecret || !doc.server) return null
  return {
    login: decryptSecret(doc.encryptedKey),
    password: decryptSecret(doc.encryptedSecret),
    server: doc.server,
  }
}

export async function saveBrokerConfig(userId: string, input: SaveBrokerConfigInput): Promise<BrokerConfigPublic> {
  const userObjectId = new mongoose.Types.ObjectId(userId)
  const existing = await BrokerCredential.findOne({ userId: userObjectId, ...XM_QUERY })

  if (!existing && !input.password) {
    throw new Error("MT5 password is required when creating a new connection")
  }

  const encryptedKey = encryptSecret(input.login)
  const encryptedSecret = input.password
    ? encryptSecret(input.password)
    : existing?.encryptedSecret
  if (!encryptedSecret) {
    throw new Error("MT5 password is required when creating a new connection")
  }

  const canEnable = input.connectionStatus === "connected" && Boolean(encryptedSecret)
  const execution = applyExecutionEnabled(input.execution, canEnable ? input.execution.enabled : false)

  const status = input.connectionStatus ?? existing?.lastConnectionStatus ?? "not_connected"
  const lastMessage = input.lastMessage ?? existing?.lastConnectionMessage ?? null

  const credentialFields = {
    userId: userObjectId,
    provider: "xm" as const,
    environment: "live" as const,
    label: XM_CREDENTIAL_LABEL,
    isDefault: true,
    enabled: true,
    encryptedKey,
    encryptedSecret,
    lastFour: input.login.slice(-4),
    platform: input.platform,
    server: input.server.trim(),
    brokerName: input.broker,
    lastConnectionStatus: status,
    lastConnectionMessage: lastMessage,
    lastCheckedAt: new Date(),
  }

  const session = await mongoose.startSession()
  let usedFallback = false
  try {
    session.startTransaction()
    await BrokerCredential.findOneAndUpdate(
      { userId: userObjectId, ...XM_QUERY },
      { $set: credentialFields },
      { upsert: true, new: true, session, setDefaultsOnInsert: true },
    )
    await User.updateOne(
      { _id: userId },
      { $set: { brokerExecutionPreferences: execution } },
      { session },
    )
    await session.commitTransaction()
  } catch {
    usedFallback = true
    await session.abortTransaction().catch(() => undefined)
  } finally {
    await session.endSession()
  }

  if (usedFallback) {
    await BrokerCredential.findOneAndUpdate(
      { userId: userObjectId, ...XM_QUERY },
      { $set: credentialFields },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    await User.updateOne({ _id: userId }, { $set: { brokerExecutionPreferences: execution } })
  }

  return loadBrokerConfig(userId)
}

export async function recordConnectionCheck(
  userId: string,
  status: BrokerConnectionStatus,
  message: string,
): Promise<void> {
  await BrokerCredential.updateOne(
    { userId: new mongoose.Types.ObjectId(userId), ...XM_QUERY },
    {
      $set: {
        lastConnectionStatus: status,
        lastConnectionMessage: message,
        lastCheckedAt: new Date(),
      },
    },
  )
  if (status !== "connected") {
    const user = await User.findById(userId).select("brokerExecutionPreferences")
    if (user) {
      const prefs = normalizeExecutionPreferences(user.brokerExecutionPreferences)
      user.brokerExecutionPreferences = applyExecutionEnabled(prefs, false)
      await user.save()
    }
  }
}

