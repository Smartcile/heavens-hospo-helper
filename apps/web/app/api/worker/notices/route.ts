import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

// Active notices for this worker's venue/department, with their ack status.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const notices = await prisma.notice.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      venueId: session.venueId,
      OR: [{ departmentId: null }, ...(session.departmentId ? [{ departmentId: session.departmentId }] : [])],
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
