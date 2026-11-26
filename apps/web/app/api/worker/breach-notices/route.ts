import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerBreachAccess } from '@/lib/worker-breach-access'
import { createBreachNotice } from '@/lib/breach-notices.server'
import { getTodayDate } from '@/lib/utils'
import { formatDateKey } from '@/lib/scheduling'

const name = (person: { firstName: string; lastName: string } | null | undefined) =>
  person ? `${person.firstName} ${person.lastName}`.trim() : null

const STATUSES = ['SUBMITTED', 'WAIVED', 'DECLINED', 'PAID', 'WITHDRAWN'] as const
type Status = (typeof STATUSES)[number]
const isStatus = (value: string): value is Status => (STATUSES as readonly string[]).includes(value)

function shape(row: {
  submittedBy?: { firstName: string; lastName: string } | null
  subjectStaff?: { firstName: string; lastName: string } | null
  reviewedBy?: { firstName: string; lastName: string } | null
  [key: string]: unknown
}) {
  return {
    ...row,
    submittedByName: name(row.submittedBy),
    subjectStaffName: name(row.subjectStaff),
    reviewedByName: name(row.reviewedBy),
    submittedBy: undefined,
    subjectStaff: undefined,
    reviewedBy: undefined,
  }
}

/** GET /api/worker/breach-notices — own rows for staff, venue queue for managers. */
export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerBreachAccess(session)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const params = req.nextUrl.searchParams
  const subjectType = params.get('subjectType')?.toUpperCase()
  const status = params.get('status')?.toUpperCase()

  const rows = await prisma.breachNotice.findMany({
    where: {
      venueId: session.venueId,
      deletedAt: null,
      ...(access.venueWide ? {} : { submittedById: session.staffId }),
      ...(subjectType === 'STAFF' || subjectType === 'CLIENT' ? { subjectType } : {}),
      ...(status && isStatus(status) ? { status } : {}),
    },
    include: {
      submittedBy: { select: { firstName: true, lastName: true } },
      subjectStaff: { select: { firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ ...access, items: rows.map(shape) })
}

/** POST /api/worker/breach-notices — submit a notice. */
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerBreachAccess(session)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'INVALID REQUEST' }, { status: 400 })

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })

  const result = await createBreachNotice({
    venueId: session.venueId,
    submittedById: session.staffId,
    input: body,
    today: formatDateKey(getTodayDate(venue?.timezone)),
    allowClient: access.canSubmitClient,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ notice: result.notice }, { status: 201 })
}
