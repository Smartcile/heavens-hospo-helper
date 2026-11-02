'use client'

import { useEffect, useState } from 'react'

/**
 * True when the signed-in admin-panel user has the ADMIN role. Managers and
 * workers see annotated images everywhere, but only ADMINs may edit layers or
 * browse the media library — the pickers use this to hide those actions.
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (alive) setIsAdmin(s?.user?.role === 'ADMIN') })
      .catch(() => { /* signed out — no admin actions */ })
    return () => { alive = false }
  }, [])

  return isAdmin
}
