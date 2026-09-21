"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getCurrentUser } from "@/lib/client-auth"
import { cn } from "@/lib/utils"

type HeaderUser = {
  email: string
  name?: string
}

function resolveDisplayName(user: HeaderUser): string {
  const trimmed = user.name?.trim()
  if (trimmed) return trimmed

  const local = user.email.split("@")[0] ?? user.email
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function resolveInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  return label.slice(0, 2).toUpperCase()
}

export function HeaderUserPersona({ className }: { className?: string }) {
  const [user, setUser] = useState<HeaderUser | null>(null)

  useEffect(() => {
    let active = true

    getCurrentUser()
      .then((currentUser) => {
        if (active && currentUser) setUser(currentUser)
      })
      .catch(() => {
        if (active) setUser(null)
      })

    return () => {
      active = false
    }
  }, [])

  if (!user) return null

  const displayName = resolveDisplayName(user)
  const initials = resolveInitials(displayName)

  return (
    <Link
      href="/profile"
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-2.5 py-1.5 transition-colors hover:bg-cyan-400/10",
        className,
      )}
      title={user.email}
    >
      <Avatar className="h-8 w-8 border border-cyan-400/25">
        <AvatarFallback className="bg-cyan-500/15 text-[11px] font-semibold text-cyan-200">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium text-cyan-100">{displayName}</p>
        <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{user.email}</p>
      </div>
    </Link>
  )
}
