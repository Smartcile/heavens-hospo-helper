import { NextRequest } from 'next/server'

type SessionLike = {
  user: {
    role: string
    venueId: string
    availableVenueIds: string[]
  }
} | null

/**
 * Resolve the venue a session is effectively acting on. A MANAGER uses the
 * active-venue cookie only when it is one of their available venues; otherwise
 * their home venue. ADMIN (and any other role) returns their home venue.
 * Pure so server pages and route guards share the same rule.
 */
export function resolveEffectiveVenueId(
  session: SessionLike,
  cookieVenueId?: string | null,
): string | null {
  if (!session) return null
  if (session.user.role === 'MANAGER') {
    if (cookieVenueId && session.user.availableVenueIds?.includes(cookieVenueId)) {
      return cookieVenueId
    }
    return session.user.venueId
  }
  return session.user.venueId
}

/**
 * Returns the effective venue ID for MANAGER scoping.
 * Reads the `admin-active-venue` cookie; falls back to the session's home venue.
 * Returns null for ADMIN (no venue filter) or unauthenticated sessions.
 */
export function getManagerVenueId(session: SessionLike, req: NextRequest): string | null {
  if (!session || !req) return null
  if (session.user.role !== 'MANAGER') return null

  return resolveEffectiveVenueId(session, req.cookies.get('admin-active-venue')?.value)
}

/**
 * Returns the venue IDs that this session can access.
 * ADMIN sees all from availableVenueIds; MANAGER sees their home + assigned venues.
 */
export function getAccessibleVenueIds(session: SessionLike): string[] {
  if (!session) return []
  return session.user.availableVenueIds ?? [session.user.venueId]
}

/**
 * Resolve the venue a route should operate on. A MANAGER is always bound to the
 * effective venue from the `admin-active-venue` cookie; their `requested` venue
 * is ignored. An ADMIN must name a venue they can access (falling back to their
 * home venue), otherwise the request is refused.
 */
export function resolveScopedVenueId(
  session: SessionLike,
  req: NextRequest,
  requested?: string | null,
): { venueId: string } | { error: 'FORBIDDEN' } {
  if (!session) return { error: 'FORBIDDEN' }

  if (session.user.role === 'MANAGER') {
    const venueId = getManagerVenueId(session, req)
    return venueId ? { venueId } : { error: 'FORBIDDEN' }
  }

  const venueId = String(
    requested || req.nextUrl.searchParams.get('venueId') || session.user.venueId,
  ).trim()
  if (!venueId) return { error: 'FORBIDDEN' }

  const accessible = getAccessibleVenueIds(session)
  if (!accessible.includes(venueId)) return { error: 'FORBIDDEN' }

  return { venueId }
}
