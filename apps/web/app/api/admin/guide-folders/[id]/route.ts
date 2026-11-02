import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

async function loadScoped(id: string, role: string, sessionVenueId: string) {
  const folder = await prisma.guideFolder.findUnique({
    where: { id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!folder || folder.deletedAt) return { error: 'Not found', status: 404 as const }
  if (role === 'MANAGER' && folder.venueId !== sessionVenueId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { folder }
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
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0

  const folder = await prisma.guideFolder.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(folder)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.edit')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  // Soft-delete the folder but keep its guides — they fall back to UNFILED.
  await prisma.$transaction([
    prisma.guide.updateMany({ where: { folderId: params.id }, data: { folderId: null } }),
    prisma.guideFolder.update({ where: { id: params.id }, data: { deletedAt: new Date() } }),
  ])

  return NextResponse.json({ success: true })
}
