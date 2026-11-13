import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'

// Single list for the admin: every staff plate submission (pending/reviewed)
// plus the approved plates with their "entered in the system" tick.

const staffSelect = { select: { id: true, firstName: true, lastName: true } }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [requests, plates, venue] = await Promise.all([
    prisma.staffParkingPlateRequest.findMany({
      where: { venueId: scoped.venueId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { staff: staffSelect },
    }),
    prisma.staffParkingPlate.findMany({
      where: { venueId: scoped.venueId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { staff: staffSelect },
    }),
    prisma.venue.findUnique({
      where: { id: scoped.venueId },
      select: { timezone: true },
    }),
  ])

  return NextResponse.json({
    requests,
    plates,
    counts: {
      pending: requests.filter((row) => row.status === 'PENDING').length,
      toEnter: plates.filter((row) => row.status === 'ACTIVE' && !row.enteredInSystem).length,
      active: plates.filter((row) => row.status === 'ACTIVE').length,
    },
    timezone: venue?.timezone || 'Pacific/Auckland',
  })
}
