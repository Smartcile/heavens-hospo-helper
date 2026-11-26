import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { canAccess, guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { createBreachNotice } from '@/lib/breach-notices.server'
import { getTodayDate } from '@/lib/utils'
import { formatDateKey } from '@/lib/scheduling'

const name = (person: { firstName: string; lastName: string } | null | undefined) =>
  person ? `${person.firstName} ${person.lastName}`.trim() : null

const STATUSES = ['SUBMITTED', 'WAIVED', 'DECLINED', 'PAID', 'WITHDRAWN'] as const
type Status = (typeof STATUSES)[number]
const isStatus = (value: string): value is Status => (STATUSES as readonly string[]).includes(value)

/** GET /api/admin/breach-notices?venueId=&subjectType=&status= */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.breaches.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req, req.nextUrl.searchParams.get('venueId'))
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const subjectType = req.nextUrl.searchParams.get('subjectType')?.toUpperCase()
  const status = req.nextUrl.searchParams.get('status')?.toUpperCase()

  const rows = await prisma.breachNotice.findMany({
    where: {
      venueId: scoped.venueId,
      deletedAt: null,
      ...(subjectType === 'STAFF' || subjectType === 'CLIENT' ? { subjectType } : {}),
      ...(status && isStatus(status) ? { status } : {}),
    },
    include: {
      submittedBy: { select: { firstName: true, lastName: true } },
      subjectStaff: { select: { firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  })

  const canReview = await canAccess(session, req, 'team.breaches.review')
  const rank = (status: string) => (status === 'SUBMITTED' ? 0 : 1)
  const items = rows
    .map(({ submittedBy, subjectStaff, reviewedBy, ...rest }) => ({
      ...rest,
      submittedByName: name(submittedBy),
      subjectStaffName: name(subjectStaff),
      reviewedByName: name(reviewedBy),
    }))
    .sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt.getTime() - a.createdAt.getTime())
  return NextResponse.json({ items, canReview })
}

/** POST /api/admin/breach-notices — a manager records a CLIENT notice. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.breaches.review')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'INVALID REQUEST' }, { status: 400 })

  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : null)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const venue = await prisma.venue.findUnique({
    where: { id: scoped.venueId },
    select: { timezone: true },
  })

  const result = await createBreachNotice({
    venueId: scoped.venueId,
    submittedById: session.user.id,
    input: body,
    today: formatDateKey(getTodayDate(venue?.timezone)),
    allowClient: true,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ notice: result.notice }, { status: 201 })
}
