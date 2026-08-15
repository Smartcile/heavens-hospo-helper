import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'floorplans.plans.view')
  if (denied) return denied

  const boundaries = await prisma.sectionBoundary.findMany({
    where: { floorPlanId: params.id, deletedAt: null },
    include: { section: { select: { name: true } } },
    orderBy: { zIndex: 'asc' },
  })

  const result = boundaries.map((b) => ({
    id: b.id,
    shape: b.shape,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    vertices: b.vertices,
    sectionId: b.sectionId,
    sectionName: b.section.name,
    zIndex: b.zIndex,
  }))

  return NextResponse.json(result)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'floorplans.plans.edit')
  if (denied) return denied

  const plan = await prisma.floorPlan.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!plan) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && plan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { boundaries } = await req.json()
  if (!Array.isArray(boundaries)) {
    return NextResponse.json({ error: 'boundaries array is required' }, { status: 400 })
  }

  const existing = await prisma.sectionBoundary.findMany({
    where: { floorPlanId: params.id, deletedAt: null },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((e) => e.id))
  const incomingIds = new Set(boundaries.filter((b: { id?: string }) => b.id).map((b: { id: string }) => b.id))

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))
  if (toDelete.length > 0) {
    await prisma.sectionBoundary.updateMany({
      where: { id: { in: toDelete }, floorPlanId: params.id },
      data: { deletedAt: new Date() },
    })
  }

  const results: { id: string; _clientId?: string }[] = []
  for (const b of boundaries) {
    const data = {
      floorPlanId: params.id,
      sectionId: b.sectionId,
      shape: b.shape ?? 'RECTANGLE',
      x: b.x ?? 0,
      y: b.y ?? 0,
      width: b.width ?? null,
      height: b.height ?? null,
      vertices: b.vertices ?? null,
      zIndex: b.zIndex ?? 0,
    }

    if (b.id && existingIds.has(b.id)) {
      const updated = await prisma.sectionBoundary.update({ where: { id: b.id }, data })
      results.push({ id: updated.id, _clientId: b._clientId })
    } else {
      const created = await prisma.sectionBoundary.create({ data })
      results.push({ id: created.id, _clientId: b._clientId })
    }
  }

  return NextResponse.json({ saved: results, deleted: toDelete.length })
}
