import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

// The day-in-lieu ledger: days earned from public holidays worked, and
// whether they've been taken. GET lists (optional ?taken=1 filter for owed),
// PATCH { id, takenOn } marks a day taken.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.view')
  if (denied) return denied

  const venueId = req.nextUrl.searchParams.get('venueId') || session.user.venueId
  const taken = req.nextUrl.searchParams.get('taken')

  const days = await prisma.alternativeDay.findMany({
    where: {
      venueId,
      deletedAt: null,
      ...(taken === '1' ? { takenOn: { not: null } } : taken === '0' ? { takenOn: null } : {}),
    },
    include: { staff: { select: { firstName: true, lastName: true } } },
    orderBy: [{ takenOn: 'asc' }, { accruedOn: 'desc' }],
  })

  return NextResponse.json(
    days.map((d) => ({
      id: d.id,
      staffId: d.staffId,
      staffName: `${d.staff.firstName} ${d.staff.lastName}`,
      accruedOn: d.accruedOn.toISOString().slice(0, 10),
      takenOn: d.takenOn ? d.takenOn.toISOString().slice(0, 10) : null,
    }))
  )
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.view')
  if (denied) return denied

  const body = await req.json()
  const { id, takenOn } = body
  if (!id) return NextResponse.json({ error: 'ID IS REQUIRED' }, { status: 400 })

  const day = await prisma.alternativeDay.findUnique({ where: { id } })
  if (!day || day.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.alternativeDay.update({
    where: { id },
    data: { takenOn: takenOn ? new Date(takenOn) : null },
  })

  return NextResponse.json(updated)
}
