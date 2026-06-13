import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { isValidTime } from '@/lib/calendar'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { staffId, date, startTime, endTime, departmentId, note } = body as {
    staffId: string
    date: string
    startTime: string
    endTime: string
    departmentId?: string | null
    note?: string
  }

  if (!staffId || !date || !startTime || !endTime) {
    return NextResponse.json({ error: 'staffId, date, startTime and endTime are required' }, { status: 400 })
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return NextResponse.json({ error: 'Times must be HH:mm' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { venueId: true, departmentId: true } })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const shift = await prisma.shift.create({
    data: {
      staffId,
      venueId: staff.venueId,
      departmentId: departmentId ?? staff.departmentId ?? null,
      date: new Date(date),
      startTime,
      endTime,
      note: note?.trim() || null,
      createdById: session.user.id,
    },
  })

  return NextResponse.json(shift, { status: 201 })
}
