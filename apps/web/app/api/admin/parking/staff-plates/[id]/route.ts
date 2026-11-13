import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'

// Tick a plate off once it has been entered into the external parking system.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plate = await prisma.staffParkingPlate.findUnique({ where: { id: params.id } })
  if (!plate || plate.deletedAt) {
    return NextResponse.json({ error: 'PLATE NOT FOUND' }, { status: 404 })
  }

  const scoped = resolveScopedVenueId(session, req, plate.venueId)
  if ('error' in scoped || scoped.venueId !== plate.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const enteredInSystem = body.enteredInSystem === true

  const updated = await prisma.staffParkingPlate.update({
    where: { id: plate.id },
    data: {
      enteredInSystem,
      enteredAt: enteredInSystem ? new Date() : null,
      enteredById: enteredInSystem ? session.user.id : null,
    },
  })

  return NextResponse.json({ plate: updated })
}
