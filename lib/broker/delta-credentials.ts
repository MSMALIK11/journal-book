import mongoose from "mongoose"
import BrokerCredential from "@/app/api/models/BrokerCredential"
import { decryptSecret } from "@/lib/encryption"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import type { DeltaCredentials } from "@/lib/broker/delta-exchange"

export type DeltaAccountSummary = {
  id: string
  label: string
  lastFour?: string
  isDefault: boolean
  enabled: boolean
  environment: DeltaEnvironment
}

function getDeltaCredentialsFromEnv(environment: DeltaEnvironment): DeltaCredentials | null {
  if (environment === "live") {
    const apiKey = process.env.DELTA_LIVE_API_KEY?.trim()
    const apiSecret = process.env.DELTA_LIVE_API_SECRET?.trim()
    if (!apiKey || !apiSecret) return null
    return { apiKey, apiSecret }
  }
  const apiKey = process.env.DELTA_API_KEY?.trim()
  const apiSecret = process.env.DELTA_API_SECRET?.trim()
  if (!apiKey || !apiSecret) return null
  return { apiKey, apiSecret }
}

export function hasEnvDeltaCredentials(environment: DeltaEnvironment = "demo"): boolean {
  return Boolean(getDeltaCredentialsFromEnv(environment))
}

export function getDeltaMaxAccounts(): number {
  const raw = Number(process.env.DELTA_MAX_ACCOUNTS ?? 10)
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 10
}

/** Mongo filter — legacy rows without `environment` are treated as demo. */
export function deltaCredentialEnvironmentFilter(environment: DeltaEnvironment): Record<string, unknown> {
  if (environment === "live") return { environment: "live" }
  return {
    $or: [{ environment: "demo" }, { environment: { $exists: false } }, { environment: null }],
  }
}

const migratedBrokerUsers = new Set<string>()

export function invalidateBrokerCredentialMigration(userId: string) {
  migratedBrokerUsers.delete(userId)
}

export async function migrateLegacyBrokerCredentials(userId: string) {
  if (migratedBrokerUsers.has(userId)) return

  const userObjectId = new mongoose.Types.ObjectId(userId)
  const needsMigration = await BrokerCredential.exists({
    userId: userObjectId,
    provider: "delta",
    $or: [
      { label: { $exists: false } },
      { label: null },
      { label: "" },
      { enabled: { $exists: false } },
      { enabled: null },
      { environment: { $exists: false } },
      { environment: null },
      { lastFour: { $exists: false } },
      { lastFour: null },
      { lastFour: "" },
    ],
  })

  if (!needsMigration) {
    migratedBrokerUsers.add(userId)
    return
  }

  const legacy = await BrokerCredential.find({
    userId: userObjectId,
    provider: "delta",
    $or: [{ label: { $exists: false } }, { label: null }, { label: "" }],
  }).sort({ createdAt: 1 })

  for (const [index, doc] of legacy.entries()) {
    doc.label = index === 0 ? "Main" : `Account ${index + 1}`
    if (index === 0) doc.isDefault = true
    if (doc.enabled == null) doc.enabled = true
    if (doc.environment == null) doc.environment = "demo"
    if (!doc.lastFour && doc.encryptedKey) {
      try {
        doc.lastFour = decryptSecret(doc.encryptedKey).slice(-4)
      } catch {
        // ignore decrypt errors for corrupt rows
      }
    }
    await doc.save()
  }

  const missingEnabled = await BrokerCredential.find({
    userId: userObjectId,
    provider: "delta",
    $or: [{ enabled: { $exists: false } }, { enabled: null }],
  })
  for (const doc of missingEnabled) {
    doc.enabled = true
    await doc.save()
  }

  await BrokerCredential.updateMany(
    {
      userId: userObjectId,
      provider: "delta",
      $or: [{ environment: { $exists: false } }, { environment: null }],
    },
    { $set: { environment: "demo" } },
  )

  const all = await BrokerCredential.find({ userId: userObjectId, provider: "delta" }).sort({ createdAt: 1 })

  for (const doc of all) {
    if (!doc.lastFour && doc.encryptedKey) {
      try {
        doc.lastFour = decryptSecret(doc.encryptedKey).slice(-4)
        await doc.save()
      } catch {
        // ignore
      }
    }
  }

  for (const environment of ["demo", "live"] as const) {
    const envDocs = all.filter((d) => (d.environment ?? "demo") === environment)
    if (envDocs.length > 0 && !envDocs.some((d) => d.isDefault)) {
      envDocs[0].isDefault = true
      await envDocs[0].save()
    }
  }

  migratedBrokerUsers.add(userId)
}

function toAccountSummary(doc: {
  _id: mongoose.Types.ObjectId | string
  label?: string
  lastFour?: string
  isDefault?: boolean
  enabled?: boolean
  environment?: string
}): DeltaAccountSummary {
  const trimmed = doc.label?.trim()
  const id = typeof doc._id === "string" ? doc._id : doc._id.toString()
  const fallback = doc.lastFour ? `Account ····${doc.lastFour}` : `Account ${id.slice(-4)}`
  return {
    id,
    label: trimmed || fallback,
    lastFour: doc.lastFour,
    isDefault: Boolean(doc.isDefault),
    enabled: doc.enabled !== false,
    environment: doc.environment === "live" ? "live" : "demo",
  }
}

export async function listDeltaAccounts(
  userId: string,
  environment: DeltaEnvironment = "demo",
): Promise<DeltaAccountSummary[]> {
  await migrateLegacyBrokerCredentials(userId)
  const docs = await BrokerCredential.find({
    userId: new mongoose.Types.ObjectId(userId),
    provider: "delta",
    ...deltaCredentialEnvironmentFilter(environment),
  }).sort({ isDefault: -1, createdAt: 1 })

  return docs.map(toAccountSummary)
}

export async function listEnabledDeltaAccounts(
  userId: string,
  environment: DeltaEnvironment = "demo",
): Promise<DeltaAccountSummary[]> {
  const accounts = await listDeltaAccounts(userId, environment)
  return accounts.filter((a) => a.enabled)
}

export async function getBrokerAccountForUser(
  userId: string,
  accountId: string,
  environment?: DeltaEnvironment,
) {
  await migrateLegacyBrokerCredentials(userId)
  if (!mongoose.Types.ObjectId.isValid(accountId)) return null
  const query: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(accountId),
    userId: new mongoose.Types.ObjectId(userId),
    provider: "delta",
  }
  if (environment) Object.assign(query, deltaCredentialEnvironmentFilter(environment))
  return BrokerCredential.findOne(query)
}

export async function getDeltaCredentialsByAccountId(
  userId: string,
  accountId: string,
  environment: DeltaEnvironment = "demo",
  options?: { allowDisabled?: boolean },
): Promise<{ creds: DeltaCredentials; account: DeltaAccountSummary; environment: DeltaEnvironment } | null> {
  if (hasEnvDeltaCredentials(environment)) {
    const envCreds = getDeltaCredentialsFromEnv(environment)!
    const apiKey =
      environment === "live"
        ? (process.env.DELTA_LIVE_API_KEY?.trim() ?? "")
        : (process.env.DELTA_API_KEY?.trim() ?? "")
    return {
      creds: envCreds,
      environment,
      account: {
        id: "env",
        label: environment === "live" ? "Env override (live)" : "Env override",
        lastFour: apiKey.slice(-4),
        isDefault: true,
        enabled: true,
        environment,
      },
    }
  }

  const doc = await getBrokerAccountForUser(userId, accountId, environment)
  if (!doc) return null
  const account = toAccountSummary(doc)
  if (account.environment !== environment) return null
  if (!options?.allowDisabled && !account.enabled) return null
  return {
    creds: {
      apiKey: decryptSecret(doc.encryptedKey),
      apiSecret: decryptSecret(doc.encryptedSecret),
    },
    account,
    environment,
  }
}

export async function getDefaultDeltaAccount(userId: string, environment: DeltaEnvironment = "demo") {
  await migrateLegacyBrokerCredentials(userId)
  const userObjectId = new mongoose.Types.ObjectId(userId)
  const defaultDoc = await BrokerCredential.findOne({
    userId: userObjectId,
    provider: "delta",
    isDefault: true,
    enabled: { $ne: false },
    ...deltaCredentialEnvironmentFilter(environment),
  })
  if (defaultDoc) return defaultDoc
  return BrokerCredential.findOne({
    userId: userObjectId,
    provider: "delta",
    enabled: { $ne: false },
    ...deltaCredentialEnvironmentFilter(environment),
  }).sort({ createdAt: 1 })
}

export async function getDeltaCredentialsForUser(
  userId: string,
  environment: DeltaEnvironment = "demo",
): Promise<DeltaCredentials | null> {
  const envCreds = getDeltaCredentialsFromEnv(environment)
  if (envCreds) return envCreds

  const doc = await getDefaultDeltaAccount(userId, environment)
  if (!doc) return null
  return {
    apiKey: decryptSecret(doc.encryptedKey),
    apiSecret: decryptSecret(doc.encryptedSecret),
  }
}

export async function getDeltaCredentialMeta(userId: string, environment: DeltaEnvironment = "demo") {
  if (hasEnvDeltaCredentials(environment)) {
    const apiKey =
      environment === "live"
        ? (process.env.DELTA_LIVE_API_KEY?.trim() ?? "")
        : (process.env.DELTA_API_KEY?.trim() ?? "")
    return {
      configured: true,
      source: "env" as const,
      lastFour: apiKey.slice(-4) || undefined,
    }
  }

  const accounts = await listDeltaAccounts(userId, environment)
  const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0]
  if (!defaultAccount) {
    return { configured: false, source: "none" as const, lastFour: undefined as string | undefined }
  }

  return {
    configured: true,
    source: "user" as const,
    lastFour: defaultAccount.lastFour,
  }
}

export async function resolveAccountIdsForUser(
  userId: string,
  accountIds: string[],
  environment: DeltaEnvironment = "demo",
): Promise<string[]> {
  if (hasEnvDeltaCredentials(environment)) {
    return accountIds.length > 0 ? ["env"] : ["env"]
  }
  const unique = [...new Set(accountIds.filter(Boolean))]
  const resolved: string[] = []
  for (const id of unique) {
    const doc = await getBrokerAccountForUser(userId, id, environment)
    if (doc && doc.enabled !== false) resolved.push(doc._id.toString())
  }
  return resolved
}
