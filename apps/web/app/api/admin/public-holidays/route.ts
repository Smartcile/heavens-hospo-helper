import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

// National defaults (venueId null) + per-venue additions. GET returns both,
// POST adds a holiday, DELETE removes it (soft).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.view')
  if (denied) return denied

  const venueId = req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const holidays = await prisma.publicHoliday.findMany({
    where: { deletedAt: null, OR: [{ venueId: null }, { venueId }] },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(
    holidays.map((h) => ({
      id: h.id,
      date: h.date.toISOString().slice(0, 10),
      name: h.name,
      isRegional: h.isRegional,
      national: h.venueId === null,
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.view')
  if (denied) return denied

  const body = await req.json()
  const venueId = body.venueId || session.user.venueId
  const { date, name, isRegional } = body

  if (!date || !name) return NextResponse.json({ error: 'DATE AND NAME ARE REQUIRED' }, { status: 400 })

  const holiday = await prisma.publicHoliday.create({
    data: { venueId, date: new Date(date), name: name.trim(), isRegional: !!isRegional },
  })

  return NextResponse.json(holiday, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.view')
  if (denied) return denied

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID IS REQUIRED' }, { status: 400 })

  await prisma.publicHoliday.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
