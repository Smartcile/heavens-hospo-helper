import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.services.view')
  if (denied) return denied

  const venueId = new URL(req.url).searchParams.get('venueId')
  // MANAGER is always locked to their own venue. ADMIN with no venueId gets
  // every venue's services (the sidebar "ALL VENUES" selection).
  const where =
    session.user.role === 'MANAGER'
      ? { venueId: session.user.venueId }
      : venueId
        ? { venueId }
        : {}

  const services = await prisma.service.findMany({
    where: { deletedAt: null, ...where },
    include: {
      venue: { select: { id: true, name: true } },
      slots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      exceptions: { orderBy: { date: 'asc' } },
      tablePlanSetup: { select: { id: true, name: true, floorPlan: { select: { id: true, name: true } } } },
      _count: { select: { orders: true } },
    },
    orderBy: [{ venueId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(services)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.services.create')
  if (denied) return denied

  const body = await req.json()
  const { name, venueId } = body as { name?: string; venueId?: string }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Service name is required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId || session.user.venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const service = await prisma.service.create({
    data: { name: name.toUpperCase().trim(), venueId: scopedVenueId },
  })

  return NextResponse.json(service, { status: 201 })
}
