import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { cleanNoticeAudiences, noticeAppliesTo, type NoticeAudienceKind } from '@/lib/notice-audience'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  const notices = await prisma.notice.findMany({
    where: { deletedAt: null, ...(venueScope ? { venueId: venueScope } : {}) },
    include: {
      department: { select: { id: true, name: true } },
      venue: { select: { id: true, name: true } },
      audiences: { select: { kind: true, targetId: true } },
      _count: { select: { acks: true } },
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })

  // How many staff each notice applies to (for "x of y acknowledged").
  const staff = await prisma.staff.findMany({
    where: { deletedAt: null, isActive: true, ...(venueScope ? { venueId: venueScope } : {}) },
    select: {
      venueId: true,
      departmentId: true,
      sections: { select: { sectionId: true } },
      positions: { select: { positionId: true } },
    },
  })
  const applicableCount = (n: {
    venueId: string
    departmentId: string | null
    audiences: { kind: string; targetId: string }[]
  }) =>
    staff.filter(
      (s) =>
        s.venueId === n.venueId &&
        noticeAppliesTo(
          { departmentId: n.departmentId, audiences: n.audiences.map((a) => ({ kind: a.kind as NoticeAudienceKind, targetId: a.targetId })) },
          {
            departmentId: s.departmentId,
            sectionIds: new Set(s.sections.map((x) => x.sectionId)),
            positionIds: new Set(s.positions.map((x) => x.positionId)),
          },
        ),
    ).length

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
      audiences: n.audiences,
      ackCount: n._count.acks,
      applicableCount: applicableCount(n),
      createdAt: n.createdAt,
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.post')
  if (denied) return denied

  const body = await req.json()
  const { venueId, departmentId, title, body: text, priority, pinned, requiresAck, startsAt, endsAt, audiences } = body
  const cleanAud = cleanNoticeAudiences(audiences)

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
      audiences: cleanAud.length ? { create: cleanAud } : undefined,
      createdById: session.user.id,
    },
  })

  return NextResponse.json(notice, { status: 201 })
}
