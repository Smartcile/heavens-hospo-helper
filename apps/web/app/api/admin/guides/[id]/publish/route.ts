import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.publish')
  if (denied) return denied

  const body = await req.json()
  const { status } = body as { status: 'DRAFT' | 'PUBLISHED' }

  if (status !== 'DRAFT' && status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const existing = await prisma.guide.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const guide = await prisma.guide.update({
    where: { id: params.id },
    data: { status },
  })

  return NextResponse.json(guide)
}
