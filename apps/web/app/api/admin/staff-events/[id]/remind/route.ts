import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

// In-app reminder only: stamp the event and every still-pending invite. The
// worker notice reads reminderSentAt and surfaces the nudge.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.post')
  if (denied) return denied

  const event = await prisma.staffEvent.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true, status: true },
  })
  if (!event) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  if (session.user.role === 'MANAGER' && event.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (event.status !== 'PUBLISHED') return NextResponse.json({ error: 'PUBLISH THE EVENT BEFORE REMINDING STAFF' }, { status: 409 })

  const now = new Date()
  const updated = await prisma.staffEventInvite.updateMany({
    where: { staffEventId: event.id, deletedAt: null, response: 'PENDING' },
    data: { reminderSentAt: now },
  })
  await prisma.staffEvent.update({ where: { id: event.id }, data: { reminderSentAt: now } })

  return NextResponse.json({ success: true, reminded: updated.count })
}
