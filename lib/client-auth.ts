export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  })

  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/"
  ) {
    window.location.assign("/")
  }

  return response
}

export async function signOut() {
  const response = await fetch("/api/auth/signout", {
    method: "POST",
    credentials: "include",
  })
  return { error: response.ok ? null : new Error("Unable to sign out") }
}

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
    cache: "no-store",
  })
  if (!response.ok) return null
  const data = await response.json()
  return data.user
}

export async function getProfile() {
  try {
    const response = await authFetch("/api/profile", { cache: "no-store" })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Unable to load profile")
    return { data: result.profile, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Unable to load profile"),
    }
  }
}

export async function updateProfile(updates: {
  name: string
  mobile: string
  trading_style: string
  risk_profile: string
}) {
  try {
    const response = await authFetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Unable to update profile")
    return { data: result.profile, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Unable to update profile"),
    }
  }
}
