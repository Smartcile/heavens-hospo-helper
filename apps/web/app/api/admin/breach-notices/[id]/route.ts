import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'

type Params = { params: { id: string } }

const name = (person: { firstName: string; lastName: string } | null | undefined) =>
  person ? `${person.firstName} ${person.lastName}`.trim() : null

/** GET /api/admin/breach-notices/[id] */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.breaches.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req, req.nextUrl.searchParams.get('venueId'))
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = await prisma.breachNotice.findFirst({
    where: { id: params.id, venueId: scoped.venueId, deletedAt: null },
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
    submittedByName: name(submittedBy),
    subjectStaffName: name(subjectStaff),
    reviewedByName: name(reviewedBy),
  })
}
