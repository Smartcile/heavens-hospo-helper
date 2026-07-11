import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const activeOnly = url.searchParams.get('active') === '1'
  const venueId = url.searchParams.get('venueId') || session.user.venueId
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const limit = Number(url.searchParams.get('limit') ?? 500)

  const where: Record<string, unknown> = {
    venueId,
    deletedAt: null,
  }
  if (activeOnly) {
    where.isActive = true
  }
  if (from) {
    where.clockIn = { ...(where.clockIn as Record<string, unknown> ?? {}), gte: new Date(from) }
  }
  if (to) {
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
    where.clockIn = { ...(where.clockIn as Record<string, unknown> ?? {}), lte: toDate }
  }

  const sessions = await prisma.timeClock.findMany({
    where,
    include: {
      staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
    },
    orderBy: { clockIn: 'desc' },
    take: Math.min(limit, 2000),
  })

  return NextResponse.json(sessions)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { staffId, clockIn, clockOut, note } = body

  if (!staffId || !clockIn) {
    return NextResponse.json({ error: 'STAFF AND CLOCK-IN TIME ARE REQUIRED' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { venueId: true } })
  if (!staff || staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  }

  const tc = await prisma.timeClock.create({
    data: {
      staffId,
      venueId: session.user.venueId,
      clockIn: new Date(clockIn),
      clockOut: clockOut ? new Date(clockOut) : null,
      isActive: !clockOut,
      geoValid: true,
      note: note?.trim() || 'MANUAL ENTRY',
    },
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
  })

  return NextResponse.json(tc, { status: 201 })
}
