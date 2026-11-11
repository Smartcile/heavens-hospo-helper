import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import {
  materialiseStaffEventInvites,
  syncStaffEventNotice,
  type StaffEventWithAudiences,
} from '@/lib/staff-events.server'

interface Params {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.post')
  if (denied) return denied

  const existing = await prisma.staffEvent.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { audiences: { select: { kind: true, targetId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (existing.status === 'CANCELLED') return NextResponse.json({ error: 'THIS EVENT IS CANCELLED' }, { status: 409 })

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.staffEvent.update({
        where: { id: existing.id },
        data: { status: 'PUBLISHED' },
        select: {
          id: true, venueId: true, title: true, description: true, location: true,
          startsAt: true, endsAt: true, allDay: true, attendanceRequired: true, status: true,
        },
      })
      const event: StaffEventWithAudiences = {
        ...updated,
        audiences: existing.audiences.map((a) => ({ kind: a.kind, targetId: a.targetId })),
      }
      const invites = await materialiseStaffEventInvites(tx, event)
      await syncStaffEventNotice(tx, event)
      return invites
    })
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('staff event publish failed', e)
    return NextResponse.json({ error: 'PUBLISH FAILED' }, { status: 500 })
  }
}
