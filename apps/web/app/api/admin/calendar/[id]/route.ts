import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { floorPlanSlug, floorPlanName } = body

  const event = await prisma.calendarEvent.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (session.user.role === 'MANAGER' && event.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: params.id },
    data: {
      floorPlanSlug: floorPlanSlug ?? null,
      floorPlanName: floorPlanName ?? null,
    },
  })

  return NextResponse.json(updated)
}
