type Attempt = {
  count: number
  resetAt: number
}

const attempts = new Map<string, Attempt>()

export function checkRateLimit(key: string, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now()
  const current = attempts.get(key)

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  return { allowed: true, retryAfter: 0 }
}

export function clearRateLimit(key: string) {
  attempts.delete(key)
}

export function getRateLimitKey(ip: string, email: string) {
  return `${ip}:${email.toLowerCase().trim()}`
}
