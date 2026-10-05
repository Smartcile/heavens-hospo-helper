import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { readinessForPosition } from '@/lib/position-requirements.server'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.view')
  if (denied) return denied

  const position = await prisma.position.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!position || position.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && position.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(await readinessForPosition(params.id))
}
