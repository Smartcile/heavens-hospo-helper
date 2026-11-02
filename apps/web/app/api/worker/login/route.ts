import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import {
  createWorkerSession,
  workerSessionCookieOptions,
} from '@/lib/worker-session'
import { resolveWorkerSessionMinutes } from '@/lib/worker-session-timeout'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { venueId, pin } = body

  if (!venueId || !pin) {
    return NextResponse.json({ error: 'Venue and PIN required' }, { status: 400 })
  }

  // Block login for disabled / demo-inactive venues
  const venue = await prisma.venue.findUnique({
    where: { id: venueId, deletedAt: null },
    select: { isActive: true, isDemo: true, workerSessionTimeoutMinutes: true },
  })
  if (!venue || !venue.isActive) {
    return NextResponse.json({ error: 'Venue not available' }, { status: 404 })
  }
  const timeoutMinutes = resolveWorkerSessionMinutes(venue.workerSessionTimeoutMinutes)

  // Find staff matching PIN in this venue (home venue OR shared venue)
  const staffList = await prisma.staff.findMany({
    where: {
      OR: [
        { venueId },
        { staffVenues: { some: { venueId } } },
      ],
      isActive: true,
      deletedAt: null,
      pin: { not: null },
    },
  })

  let matched: typeof staffList[0] | null = null
  for (const staff of staffList) {
    if (!staff.pin) continue
    const valid = await bcrypt.compare(String(pin), staff.pin)
    if (valid) {
      matched = staff
      break
    }
  }

  if (!matched) {
    return NextResponse.json({ error: 'INCORRECT PIN' }, { status: 401 })
  }

  const sessionToken = await createWorkerSession({
    staffId: matched.id,
    venueId,
    departmentId: matched.departmentId,
    firstName: matched.firstName,
    role: matched.role,
  }, timeoutMinutes)

  const response = NextResponse.json({ success: true, firstName: matched.firstName })
  response.cookies.set(
    'hospo-worker-session',
    sessionToken,
    workerSessionCookieOptions(timeoutMinutes)
  )

  return response
}
