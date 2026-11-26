import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerBreachAccess } from '@/lib/worker-breach-access'

type Params = { params: { id: string } }

const name = (person: { firstName: string; lastName: string } | null | undefined) =>
  person ? `${person.firstName} ${person.lastName}`.trim() : null

/** GET /api/worker/breach-notices/[id] — own row for staff, venue for managers. */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerBreachAccess(session)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = await prisma.breachNotice.findFirst({
    where: {
      id: params.id,
      venueId: session.venueId,
      deletedAt: null,
      ...(access.venueWide ? {} : { submittedById: session.staffId }),
    },
    include: {
      submittedBy: { select: { firstName: true, lastName: true } },
      subjectStaff: { select: { firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
  })
  if (!row) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  const { submittedBy, subjectStaff, reviewedBy, ...rest } = row
  return NextResponse.json({
    ...rest,
    ...access,
    submittedByName: name(submittedBy),
    subjectStaffName: name(subjectStaff),
    reviewedByName: name(reviewedBy),
  })
}
