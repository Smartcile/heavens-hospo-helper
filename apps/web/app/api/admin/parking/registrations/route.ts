import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'

// Recent guest-plate registrations for the admin history list.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? 100)
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.round(limitRaw))) : 100

  const [registrations, venue] = await Promise.all([
    prisma.parkingRegistration.findMany({
      where: { venueId: scoped.venueId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { staff: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.venue.findUnique({
      where: { id: scoped.venueId },
      select: { timezone: true },
    }),
  ])

  return NextResponse.json({
    registrations,
    timezone: venue?.timezone || 'Pacific/Auckland',
  })
}
