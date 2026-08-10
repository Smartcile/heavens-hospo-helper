import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

function timeToMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

/*
 * Restore a soft-deleted booking, optionally reseating it.
 *
 * `tableIds` (array) replaces the booking's table rows — sending it (even
 * empty) means "seat exactly these"; omitting it keeps the old rows. Either
 * way the chosen tables are guarded against overlapping active bookings on
 * the same date, so a stale screen or a second admin cannot double-book a
 * table on restore.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const booking = await prisma.booking.findFirst({
    where: { id: params.id },
    select: { id: true, venueId: true, date: true, startTime: true, endTime: true, deletedAt: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && booking.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!booking.deletedAt) {
    return NextResponse.json({ error: 'Booking is not deleted' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const requestedIds = Array.isArray(body.tableIds)
    ? (body.tableIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : null

  // Target tables: the explicit selection, or the old rows when no selection
  // was sent (restore keeps the original seating).
  let targetIds: string[]
  if (requestedIds !== null) {
    targetIds = requestedIds
  } else {
    const old = await prisma.bookingTable.findMany({
      where: { bookingId: params.id },
      select: { setupItemId: true },
    })
    targetIds = old.map((t) => t.setupItemId)
  }

  if (targetIds.length > 0) {
    const startMins = timeToMins(booking.startTime)
    const endMins = timeToMins(booking.endTime)

    const others = await prisma.booking.findMany({
      where: {
        deletedAt: null,
        id: { not: params.id },
        venueId: booking.venueId,
        date: booking.date,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: { tables: { select: { setupItemId: true } } },
    })

    const occupied = new Set<string>()
    for (const o of others) {
      const s = timeToMins(o.startTime)
      const e = timeToMins(o.endTime)
      if (s < endMins && e > startMins) {
        for (const t of o.tables) occupied.add(t.setupItemId)
      }
    }

    const clash = targetIds.find((id) => occupied.has(id))
    if (clash) {
      return NextResponse.json({ error: 'One or more tables are no longer available — pick new tables' }, { status: 409 })
    }
  }

  await prisma.$transaction([
    prisma.booking.update({ where: { id: params.id }, data: { deletedAt: null } }),
    ...(requestedIds !== null
      ? [
          prisma.bookingTable.deleteMany({ where: { bookingId: params.id } }),
          ...(requestedIds.length > 0
            ? [prisma.bookingTable.createMany({
                data: requestedIds.map((setupItemId) => ({ bookingId: params.id, setupItemId })),
              })]
            : []),
        ]
      : []),
  ])

  const restored = await prisma.booking.findFirst({
    where: { id: params.id },
    include: {
      tables: { include: { setupItem: { select: { id: true, assignedNumber: true, label: true } } } },
      service: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(restored)
}
