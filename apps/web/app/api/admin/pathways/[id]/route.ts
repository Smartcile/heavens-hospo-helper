import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

async function loadScoped(id: string, role: string, sessionVenueId: string) {
  const pathway = await prisma.pathway.findUnique({
    where: { id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!pathway || pathway.deletedAt) return { error: 'Not found', status: 404 as const }
  if (role === 'MANAGER' && pathway.venueId !== sessionVenueId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { pathway }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const pathway = await prisma.pathway.findUnique({
    where: { id: params.id },
    include: {
      nodes: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] },
      edges: true,
      department: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(pathway)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).toUpperCase().trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.sectionId !== undefined) updates.sectionId = body.sectionId || null
  if (body.positionId !== undefined) updates.positionId = body.positionId || null
  if (body.status === 'DRAFT' || body.status === 'PUBLISHED') updates.status = body.status

  const pathway = await prisma.pathway.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(pathway)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  await prisma.pathway.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: 'DRAFT' },
  })

  return NextResponse.json({ success: true })
}
