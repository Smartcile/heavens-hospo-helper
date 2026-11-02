import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import {
  listSectionWorkReviews,
  reconcileVenueSectionWork,
} from '@/lib/section-work.server'
import type { SectionWorkStatus } from '@/lib/section-work'

// Section-work review queue. GET is a read view; confirm/dismiss live on [id].
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId') || session.user.venueId

  const rawStatus = new URL(req.url).searchParams.get('status') ?? 'PENDING'
  const status: SectionWorkStatus | undefined =
    rawStatus === 'ALL'
      ? undefined
      : rawStatus === 'PENDING' || rawStatus === 'CONFIRMED' || rawStatus === 'DISMISSED'
        ? rawStatus
        : 'PENDING'

  // Lazy safety net: completions can happen through paths added later.
  await reconcileVenueSectionWork(venueId)
  const reviews = await listSectionWorkReviews(venueId, status)
  return NextResponse.json({ reviews })
}
