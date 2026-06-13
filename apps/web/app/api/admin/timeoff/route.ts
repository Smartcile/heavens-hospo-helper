import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  const requests = await prisma.timeOffRequest.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status: status as never } : {}),
      ...(venueScope ? { venueId: venueScope } : {}),
    },
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
    orderBy: { startDate: 'asc' },
  })

  return NextResponse.json(
    requests.map((r) => ({
      id: r.id,
      staffName: `${r.staff.firstName} ${r.staff.lastName}`,
      departmentName: r.staff.department?.name ?? null,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      status: r.status,
      reviewNote: r.reviewNote,
    }))
  )
}

// Manager records time off directly (auto-approved).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { staffId, startDate, endDate, reason } = body as {
    staffId: string
    startDate: string
    endDate: string
    reason?: string
  }
  if (!staffId || !startDate || !endDate) {
    return NextResponse.json({ error: 'staffId, startDate and endDate are required' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { venueId: true } })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      staffId,
      venueId: staff.venueId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason?.trim() || null,
      status: 'APPROVED',
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  })

  return NextResponse.json(request, { status: 201 })
}
