import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

const LOCK_WAIT_MS = 8_000
const LOCK_TTL_MS = 8_000
const RETRY_MS = 150

const queues = new Map<string, Promise<unknown>>()

async function acquireMongoLock(userId: string) {
  await connectDB()
  const now = Date.now()
  const result = await User.updateOne(
    {
      _id: userId,
      $or: [{ sync_lock_until: { $exists: false } }, { sync_lock_until: { $lt: new Date(now) } }],
    },
    { $set: { sync_lock_until: new Date(now + LOCK_TTL_MS) } },
  )
  return (result.modifiedCount ?? 0) > 0
}

async function releaseMongoLock(userId: string) {
  await User.updateOne({ _id: userId }, { $unset: { sync_lock_until: 1 } }).catch(() => undefined)
}

async function waitForMongoLock(userId: string) {
  const deadline = Date.now() + LOCK_WAIT_MS
  while (Date.now() < deadline) {
    if (await acquireMongoLock(userId)) return
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
  }
  // Do not drop the fill — run even if another instance is still holding the lock.
  await acquireMongoLock(userId).catch(() => undefined)
}

/**
 * Serialize concurrent sync POSTs for one user.
 * Waits in-request (no 409) so the extension does not drop the payload.
 */
export async function withUserSyncLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(userId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const chained = previous.catch(() => undefined).then(() => gate)
  queues.set(userId, chained)

  await Promise.race([
    previous.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, LOCK_WAIT_MS)),
  ])

  await waitForMongoLock(userId)
  try {
    return await fn()
  } finally {
    await releaseMongoLock(userId)
    release()
    if (queues.get(userId) === chained) queues.delete(userId)
  }
}
