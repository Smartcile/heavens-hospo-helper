import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import {
  clearWorkerSessionCookie,
  createWorkerSession,
  getWorkerSession,
  setWorkerSessionCookie,
} from '@/lib/worker-session'
import {
  resolveWorkerSessionMinutes,
  shouldRefreshWorkerSession,
  workerSessionExpiresAt,
} from '@/lib/worker-session-timeout'

// Sliding idle session: re-mint the current worker JWT with a fresh expiry.
// Throttled server-side — a token with more than one refresh window left is
// returned untouched, so activity pings cannot churn tokens. Venue status is
// re-checked here so disabling a venue still ends live sessions.
export async function POST() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venue = await prisma.venue.findFirst({
    where: { id: session.venueId, deletedAt: null },
    select: { isActive: true, workerSessionTimeoutMinutes: true },
  })
  if (!venue?.isActive) {
    clearWorkerSessionCookie()
    return NextResponse.json({ error: 'Venue not available' }, { status: 401 })
  }

  // A live token must still belong to an active staff member at this venue.
  // Without this a deactivated/offboarded worker could keep renewing forever.
  const staff = await prisma.staff.findFirst({
    where: {
      id: session.staffId,
      deletedAt: null,
      isActive: true,
      OR: [
        { venueId: session.venueId },
        { staffVenues: { some: { venueId: session.venueId } } },
      ],
    },
    select: { departmentId: true, firstName: true, role: true },
  })
  if (!staff) {
    clearWorkerSessionCookie()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const timeoutMinutes = resolveWorkerSessionMinutes(venue.workerSessionTimeoutMinutes)
  const now = Date.now()

  if (!shouldRefreshWorkerSession(session.expiresAt, timeoutMinutes, now)) {
    return NextResponse.json({
      refreshed: false,
      timeoutMinutes,
      expiresAt: session.expiresAt,
    })
  }

  const token = await createWorkerSession({
    staffId: session.staffId,
    venueId: session.venueId,
    // Re-mint from the CURRENT staff row, not the old token, so a demotion or
    // department move sticks the next time the session slides.
    departmentId: staff.departmentId ?? null,
    firstName: staff.firstName,
    role: staff.role,
  }, timeoutMinutes)
  setWorkerSessionCookie(token, timeoutMinutes)

  return NextResponse.json({
    refreshed: true,
    timeoutMinutes,
    expiresAt: workerSessionExpiresAt(timeoutMinutes, now),
  })
}
