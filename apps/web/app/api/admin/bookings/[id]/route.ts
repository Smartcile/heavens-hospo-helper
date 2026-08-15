import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { canAccess, guardAccess } from '@/lib/permissions'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // PUT covers both editing a booking and changing its status — either grant suffices.
  const editOk = await canAccess(session, req, 'bookings.bookings.edit')
  const statusOk = await canAccess(session, req, 'bookings.bookings.status')
  if (!editOk && !statusOk) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const booking = await prisma.booking.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && booking.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.contactName !== undefined) data.contactName = String(body.contactName).toUpperCase().trim()
  if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone || null
  if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail || null
  if (body.partySize !== undefined) data.partySize = parseInt(String(body.partySize)) || 0
  if (body.date !== undefined) data.date = new Date(body.date)
  if (body.startTime !== undefined) data.startTime = body.startTime
  if (body.endTime !== undefined) data.endTime = body.endTime
  if (body.status !== undefined) data.status = body.status
  if (body.notes !== undefined) data.notes = body.notes || null
  if (body.source !== undefined) data.source = body.source
  if (body.serviceId !== undefined) data.serviceId = body.serviceId || null

  if (body.tableIds !== undefined) {
    const ids = Array.isArray(body.tableIds) ? body.tableIds : []
    await prisma.bookingTable.deleteMany({ where: { bookingId: params.id } })
    if (ids.length > 0) {
      await prisma.bookingTable.createMany({
        data: ids.map((setupItemId: string) => ({ bookingId: params.id, setupItemId })),
      })
    }
  }

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data,
    include: { tables: { include: { setupItem: { select: { id: true, assignedNumber: true, label: true } } } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'bookings.bookings.delete')
  if (denied) return denied

  const booking = await prisma.booking.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && booking.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.booking.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
