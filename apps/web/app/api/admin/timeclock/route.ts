import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

const staffSelect = {
  select: {
    firstName: true,
    lastName: true,
    department: { select: { name: true } },
    positions: { select: { position: { select: { name: true, colour: true } } } },
  },
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const activeOnly = url.searchParams.get('active') === '1'
  const showDeleted = url.searchParams.get('deleted') === '1'
  const statusFilter = url.searchParams.get('status') // PENDING | APPROVED | REJECTED
  const venueId = url.searchParams.get('venueId') || session.user.venueId
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const limit = Number(url.searchParams.get('limit') ?? 500)

  const where: Record<string, unknown> = { venueId }
  if (showDeleted) {
    where.deletedAt = { not: null }
  } else {
    where.deletedAt = null
  }
  if (activeOnly) {
    where.isActive = true
  }
  if (statusFilter) {
    where.approvalStatus = statusFilter
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
    include: { staff: staffSelect },
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
  const { staffId, clockIn, clockOut, note, breaksMinutes } = body

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
      source: 'ADMIN',
      approvalStatus: 'APPROVED', // manager-entered entries are pre-approved
      approvedById: session.user.id,
      approvedAt: new Date(),
      breaksMinutes: Math.max(0, Math.round(Number(breaksMinutes) || 0)),
    },
    include: { staff: staffSelect },
  })

  return NextResponse.json(tc, { status: 201 })
}
