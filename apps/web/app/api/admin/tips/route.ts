import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { getAccessibleVenueIds, getManagerVenueId, resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { cleanCashCounts } from '@/lib/tips'
import { buildTipsPeriodPayload } from '@/lib/tips.server'

/** "YYYY-MM-DD" (or a full ISO string) → a UTC-midnight Date for a @db.Date column. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

const SHARES_INCLUDE = {
  shares: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { _count: { select: { notes: { where: { deletedAt: null } } } } },
  },
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.view')
  if (denied) return denied

  const requested = new URL(req.url).searchParams.get('venueId')
  let venueId: string | null = null
  if (session.user.role === 'MANAGER') {
    venueId = getManagerVenueId(session, req) ?? session.user.venueId
  } else if (requested) {
    if (!getAccessibleVenueIds(session).includes(requested)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    venueId = requested
  }

  const periods = await prisma.tipsPeriod.findMany({
    where: { deletedAt: null, ...(venueId ? { venueId } : {}) },
    orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
    include: SHARES_INCLUDE,
  })

  return NextResponse.json(periods.map(buildTipsPeriodPayload))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.create')
  if (denied) return denied

  const body = await req.json()
  const fromDate = parseDate(body.fromDate)
  const toDate = parseDate(body.toDate)
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'fromDate and toDate are required' }, { status: 400 })
  }

  const scoped = resolveScopedVenueId(session, req, body.venueId)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId

  // Every active staff member starts on the period with zero hours and a full
  // weight. Manual (non-system) people are added on the edit screen.
  const staff = await prisma.staff.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true },
  })

  const period = await prisma.tipsPeriod.create({
    data: {
      venueId,
      label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().toUpperCase() : null,
      fromDate,
      toDate,
      cashCounts: cleanCashCounts(body.cashCounts) as unknown as Prisma.InputJsonValue,
      posTotal: Number(body.posTotal) || 0,
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      shares: {
        create: staff.map((s, index) => ({
          staffId: s.id,
          name: `${s.firstName} ${s.lastName}`.trim().toUpperCase(),
          hours: 0,
          shareWeight: 1,
          sortOrder: index,
        })),
      },
    },
    include: SHARES_INCLUDE,
  })

  return NextResponse.json(buildTipsPeriodPayload(period), { status: 201 })
}
