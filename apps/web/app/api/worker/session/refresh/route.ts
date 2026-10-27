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
    departmentId: session.departmentId ?? null,
    firstName: session.firstName,
    role: session.role,
  }, timeoutMinutes)
  setWorkerSessionCookie(token, timeoutMinutes)

  return NextResponse.json({
    refreshed: true,
    timeoutMinutes,
    expiresAt: workerSessionExpiresAt(timeoutMinutes, now),
  })
}
