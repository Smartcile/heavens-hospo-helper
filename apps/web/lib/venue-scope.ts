import { NextRequest } from 'next/server'

type SessionLike = {
  user: {
    role: string
    venueId: string
    availableVenueIds: string[]
  }
} | null

/**
 * Returns the effective venue ID for MANAGER scoping.
 * Reads the `admin-active-venue` cookie; falls back to the session's home venue.
 * Returns null for ADMIN (no venue filter) or unauthenticated sessions.
 */
export function getManagerVenueId(session: SessionLike, req: NextRequest): string | null {
  if (!session || !req) return null
  if (session.user.role !== 'MANAGER') return null

  const cookieVenueId = req.cookies.get('admin-active-venue')?.value
  if (cookieVenueId && session.user.availableVenueIds?.includes(cookieVenueId)) {
    return cookieVenueId
  }

  return session.user.venueId
}

/**
 * Returns the venue IDs that this session can access.
 * ADMIN sees all from availableVenueIds; MANAGER sees their home + assigned venues.
 */
export function getAccessibleVenueIds(session: SessionLike): string[] {
  if (!session) return []
  return session.user.availableVenueIds ?? [session.user.venueId]
}
