import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

// Who has / hasn't acknowledged a notice.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notice = await prisma.notice.findUnique({
    where: { id: params.id },
    include: { acks: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } } },
  })
  if (!notice || notice.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && notice.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const applicable = await prisma.staff.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      venueId: notice.venueId,
      ...(notice.departmentId ? { departmentId: notice.departmentId } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const ackedAt = new Map(notice.acks.map((a) => [a.staffId, a.ackedAt]))

  return NextResponse.json({
    title: notice.title,
    requiresAck: notice.requiresAck,
    staff: applicable.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      acked: ackedAt.has(s.id),
      ackedAt: ackedAt.get(s.id) ?? null,
    })),
  })
}
