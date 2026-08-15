import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.assign')
  if (denied) return denied

  const body = await req.json()
  const { guideId, staffId, reason } = body as { guideId: string; staffId: string; reason?: string | null }
  if (!guideId || !staffId) {
    return NextResponse.json({ error: 'guideId and staffId required' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { venueId: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const assignment = await prisma.guideAssignment.upsert({
    where: { guideId_staffId: { guideId, staffId } },
    update: { reason: reason?.trim() || null, assignedById: session.user.id, deletedAt: null },
    create: {
      guideId,
      staffId,
      assignedById: session.user.id,
      reason: reason?.trim() || null,
    },
  })

  return NextResponse.json(assignment, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.assign')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const guideId = searchParams.get('guideId')
  const staffId = searchParams.get('staffId')
  if (!guideId || !staffId) {
    return NextResponse.json({ error: 'guideId and staffId required' }, { status: 400 })
  }

  await prisma.guideAssignment.updateMany({
    where: { guideId, staffId },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
