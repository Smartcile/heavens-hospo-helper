import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds, getManagerVenueId } from '@/lib/venue-scope'
import { reviewSectionWork, type SectionWorkAction } from '@/lib/section-work.server'

interface Params {
  params: { id: string }
}

const ACTIONS: SectionWorkAction[] = ['CONFIRM', 'DISMISS', 'REOPEN']

// CONFIRM is the only action that grants the section (it writes StaffSection).
// DISMISS / REOPEN only move the review.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.assign')
  if (denied) return denied

  const review = await prisma.sectionWorkReview.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { venueId: true },
  })
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // MANAGER is scoped to their active venue; ADMIN respects the venue they are
  // currently working in (admin-active-venue cookie), falling back to home.
  const cookieVenueId = req.cookies.get('admin-active-venue')?.value
  const activeVenueId =
    session.user.role === 'MANAGER'
      ? getManagerVenueId(session, req)
      : cookieVenueId && getAccessibleVenueIds(session).includes(cookieVenueId)
        ? cookieVenueId
        : session.user.venueId
  if (review.venueId !== activeVenueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as { action?: string; note?: string | null }
  const action = ACTIONS.includes(body.action as SectionWorkAction)
    ? (body.action as SectionWorkAction)
    : null
  if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const result = await reviewSectionWork({
    reviewId: params.id,
    action,
    reviewerId: session.user.id,
    note: body.note ?? null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.review)
}
