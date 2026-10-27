import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

// Notes + day-level lock for one availability row.
//
// `notes` is always writable — including on a locked or past day — so a
// manager and worker can keep communicating without changing availability.
// `locked` sets/clears the three lock fields; a locked day never accepts an
// availability write until it is unlocked.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    notes?: string | null
    locked?: boolean
    lockedReason?: string | null
  } | null

  const row = await prisma.staffAvailability.findUnique({ where: { id: params.id } })
  if (!row || row.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const managerVenueId = getManagerVenueId(session, req)
  if (managerVenueId && row.venueId !== managerVenueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data: {
    notes?: string | null
    lockedAt?: Date | null
    lockedById?: string | null
    lockedReason?: string | null
  } = {}

  if ('notes' in (body ?? {})) {
    data.notes = typeof body?.notes === 'string' ? body.notes.trim() || null : null
  }

  if (typeof body?.locked === 'boolean') {
    if (body.locked) {
      data.lockedAt = new Date()
      data.lockedById = session.user.id
      data.lockedReason = typeof body.lockedReason === 'string' ? body.lockedReason.trim() || null : null
    } else {
      data.lockedAt = null
      data.lockedById = null
      data.lockedReason = null
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'NOTHING TO UPDATE' }, { status: 400 })
  }

  const updated = await prisma.staffAvailability.update({ where: { id: params.id }, data })
  return NextResponse.json({
    success: true,
    locked: !!updated.lockedAt,
    notes: updated.notes,
  })
}
