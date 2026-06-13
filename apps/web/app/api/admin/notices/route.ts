import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  const notices = await prisma.notice.findMany({
    where: { deletedAt: null, ...(venueScope ? { venueId: venueScope } : {}) },
    include: {
      department: { select: { id: true, name: true } },
      venue: { select: { id: true, name: true } },
      _count: { select: { acks: true } },
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })

  // How many staff each notice applies to (for "x of y acknowledged").
  const staff = await prisma.staff.findMany({
    where: { deletedAt: null, isActive: true, ...(venueScope ? { venueId: venueScope } : {}) },
    select: { venueId: true, departmentId: true },
  })
  const applicableCount = (n: { venueId: string; departmentId: string | null }) =>
    staff.filter((s) => s.venueId === n.venueId && (!n.departmentId || s.departmentId === n.departmentId)).length

  return NextResponse.json(
    notices.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      priority: n.priority,
      pinned: n.pinned,
      requiresAck: n.requiresAck,
      startsAt: n.startsAt,
      endsAt: n.endsAt,
      isActive: n.isActive,
      venueId: n.venueId,
      venueName: n.venue.name,
      departmentId: n.departmentId,
      departmentName: n.department?.name ?? null,
      ackCount: n._count.acks,
      applicableCount: applicableCount(n),
      createdAt: n.createdAt,
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { venueId, departmentId, title, body: text, priority, pinned, requiresAck, startsAt, endsAt } = body

  if (!title?.trim() || !text?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 })
  }
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!venueScope) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const notice = await prisma.notice.create({
    data: {
      venueId: venueScope,
      departmentId: departmentId || null,
      title: title.trim(),
      body: text.trim(),
      priority: priority ?? 'INFO',
      pinned: !!pinned,
      requiresAck: !!requiresAck,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      createdById: session.user.id,
    },
  })

  return NextResponse.json(notice, { status: 201 })
}
