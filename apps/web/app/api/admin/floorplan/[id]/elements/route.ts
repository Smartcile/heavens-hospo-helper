import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await prisma.floorPlan.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!plan) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })

  if (session.user.role === 'MANAGER' && plan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { elements, zones } = await req.json()
  if (!Array.isArray(elements)) {
    return NextResponse.json({ error: 'elements array is required' }, { status: 400 })
  }

  // Get existing element IDs to diff
  const existing = await prisma.floorPlanElement.findMany({
    where: { floorPlanId: params.id, deletedAt: null },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((e) => e.id))
  const incomingIds = new Set(elements.filter((e: { id?: string }) => e.id).map((e: { id: string }) => e.id))

  // Delete elements not in the incoming set
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))
  if (toDelete.length > 0) {
    await prisma.floorPlanElement.updateMany({
      where: { id: { in: toDelete }, floorPlanId: params.id },
      data: { deletedAt: new Date(), isActive: false },
    })
  }

  // Upsert each incoming element
  const results: Record<string, unknown>[] = []
  for (const el of elements) {
    const data = {
      floorPlanId: params.id,
      type: el.type ?? 'OTHER',
      shape: el.shape ?? 'RECTANGLE',
      label: el.label ?? null,
      labelVisible: el.labelVisible ?? true,
      style: el.style ?? undefined,
      x: el.x ?? 0,
      y: el.y ?? 0,
      width: el.width ?? 80,
      depth: el.depth ?? 80,
      radius: el.radius ?? null,
      vertices: el.vertices ?? null,
      rotation: el.rotation ?? 0,
      colour: el.colour ?? null,
      fillColour: el.fillColour ?? null,
      opacity: el.opacity ?? 1,
      zIndex: el.zIndex ?? 0,
      sectionId: el.sectionId ?? null,
      capacity: el.capacity ?? null,
      sortOrder: el.sortOrder ?? 0,
      isActive: el.isActive ?? true,
    }

    if (el.id && existingIds.has(el.id)) {
      const updated = await prisma.floorPlanElement.update({
        where: { id: el.id },
        data,
      })
      results.push(updated)
    } else {
      const created = await prisma.floorPlanElement.create({ data })
      results.push(created)
    }
  }

  if (zones !== undefined) {
    await prisma.floorPlan.update({
      where: { id: params.id },
      data: { zones },
    })
  }

  return NextResponse.json({ saved: results.length, deleted: toDelete.length, zonesSaved: zones !== undefined })
}
