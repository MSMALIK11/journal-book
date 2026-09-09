export type Mt5WorkerLoginRequest = {
  login: string
  password: string
  server: string
}

export type Mt5WorkerLoginResponse = {
  ok: boolean
  message?: string
  /** FastAPI error shape. */
  detail?: string
}

function workerUrl(): string | null {
  const raw = process.env.MT5_WORKER_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, "")
}

function workerToken(): string | null {
  const token = process.env.MT5_WORKER_TOKEN?.trim()
  return token || null
}

export function isMt5WorkerConfigured(): boolean {
  return Boolean(workerUrl() && workerToken())
}

function sanitizeWorkerError(message: string): string {
  return message.replace(/password[=:]\s*\S+/gi, "password=[redacted]").slice(0, 240)
}

export async function pingMt5Worker(): Promise<{ ok: boolean; message: string }> {
  const base = workerUrl()
  const token = workerToken()
  if (!base || !token) {
    return { ok: false, message: "MT5 worker is not configured" }
  }

  const response = await fetch(`${base}/health`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!response.ok) {
    return { ok: false, message: "MT5 worker is unreachable" }
  }
  const data = (await response.json().catch(() => ({}))) as Mt5WorkerLoginResponse
  if (data.ok === false) {
    return { ok: false, message: sanitizeWorkerError(data.message || "MT5 worker is not ready") }
  }
  return { ok: true, message: "MT5 worker is reachable" }
}

export async function loginMt5Worker(input: Mt5WorkerLoginRequest): Promise<Mt5WorkerLoginResponse> {
  const base = workerUrl()
  const token = workerToken()
  if (!base || !token) {
    return { ok: false, message: "MT5 worker is not configured" }
  }

  try {
    const response = await fetch(`${base}/login`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        login: input.login,
        password: input.password,
        server: input.server,
      }),
      cache: "no-store",
    })
    const data = (await response.json().catch(() => ({}))) as Mt5WorkerLoginResponse
    if (!response.ok || !data.ok) {
      const detail = typeof data.detail === "string" ? data.detail : ""
      return {
        ok: false,
        message: sanitizeWorkerError(data.message || detail || "Connection failed"),
      }
    }
    return { ok: true, message: data.message || "Connected successfully" }
  } catch {
    return { ok: false, message: "MT5 worker is unreachable" }
  }
}
