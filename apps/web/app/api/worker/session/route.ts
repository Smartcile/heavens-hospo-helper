import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { clearWorkerSessionCookie, getWorkerSession } from '@/lib/worker-session'
import {
  resolveWorkerSessionMinutes,
  workerSessionRefreshIntervalMs,
} from '@/lib/worker-session-timeout'

// Tells the worker session guard which venue timeout to honour. The guard is
// the only client-side owner of the idle timer; this route lets it read the
// per-venue value without shipping it in the build.
export async function GET() {
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
    select: { id: true },
  })
  if (!staff) {
    clearWorkerSessionCookie()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const timeoutMinutes = resolveWorkerSessionMinutes(venue.workerSessionTimeoutMinutes)
  return NextResponse.json({
    timeoutMinutes,
    expiresAt: session.expiresAt ?? 0,
    refreshAfterMs: workerSessionRefreshIntervalMs(timeoutMinutes),
  })
}
