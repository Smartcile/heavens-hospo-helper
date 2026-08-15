import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

/** Shared guard: the position must exist, be live, and be in the caller's venue. */
async function loadScoped(id: string, role: string, sessionVenueId: string) {
  const position = await prisma.position.findUnique({
    where: { id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!position || position.deletedAt) return { error: 'Not found', status: 404 as const }
  if (role === 'MANAGER' && position.venueId !== sessionVenueId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { position }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).toUpperCase().trim()
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.colour !== undefined) updates.colour = body.colour || null
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0
  if (body.isActive !== undefined) updates.isActive = !!body.isActive

  const position = await prisma.position.update({
    where: { id: params.id },
    data: updates,
    include: { department: { select: { id: true, name: true } } },
  })

  return NextResponse.json(position)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.edit')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  // Soft delete, and drop the staff links so nobody keeps inheriting guides from
  // a role that no longer exists.
  await prisma.$transaction([
    prisma.staffPosition.deleteMany({ where: { positionId: params.id } }),
    prisma.position.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    }),
  ])

  return NextResponse.json({ success: true })
}
