import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { BEO_REQUEST_STATUS_VALUES } from '@/lib/events.server'

/** GET /api/admin/event-requests — the customer-submitted queue, venue-scoped. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.requests')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const venueId = params.get('venueId')
  const status = params.get('status')

  const requests = await prisma.beoChangeRequest.findMany({
    where: {
      deletedAt: null,
      ...(status && (BEO_REQUEST_STATUS_VALUES as readonly string[]).includes(status)
        ? { status: status as (typeof BEO_REQUEST_STATUS_VALUES)[number] }
        : {}),
      event: {
        deletedAt: null,
        ...(venueId ? { venueId } : {}),
        ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
      },
    },
    include: {
      event: {
        select: { id: true, name: true, eventDate: true, venueId: true },
      },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(requests)
}
