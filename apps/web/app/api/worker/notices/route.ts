import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { noticeWhereOr } from '@/lib/notice-audience'

// Active notices for this worker's venue/department, with their ack status.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The worker JWT carries departmentId but not sections/roles, so load them.
  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: {
      departmentId: true,
      sections: { select: { sectionId: true } },
      positions: { select: { positionId: true } },
    },
  })
  const ctx = {
    departmentId: staff?.departmentId ?? session.departmentId ?? null,
    sectionIds: new Set((staff?.sections ?? []).map((s) => s.sectionId)),
    positionIds: new Set((staff?.positions ?? []).map((p) => p.positionId)),
  }

  const now = new Date()
  const notices = await prisma.notice.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      venueId: session.venueId,
      OR: noticeWhereOr(ctx),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: { acks: { where: { staffId: session.staffId }, select: { id: true } } },
    orderBy: [{ pinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  })

  const items = notices.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    priority: n.priority,
    pinned: n.pinned,
    requiresAck: n.requiresAck,
    acked: n.acks.length > 0,
    createdAt: n.createdAt,
  }))

  const unackedRequired = items.filter((n) => n.requiresAck && !n.acked).length

  return NextResponse.json({ firstName: session.firstName, items, unackedRequired })
}
