import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string; setupId: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.floorPlanSetup.findFirst({
    where: { id: params.setupId, deletedAt: null },
    include: { floorPlan: { select: { venueId: true } } },
  })
  if (!setup) return NextResponse.json({ error: 'Setup not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && setup.floorPlan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { items } = await req.json()
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  const existing = await prisma.setupItem.findMany({
    where: { setupId: params.setupId, deletedAt: null },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((e) => e.id))
  const incomingIds = new Set(items.filter((i: { id?: string }) => i.id).map((i: { id: string }) => i.id))

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))
  if (toDelete.length > 0) {
    await prisma.setupItem.updateMany({
      where: { id: { in: toDelete }, setupId: params.setupId },
      data: { deletedAt: new Date(), isActive: false },
    })
  }

  const results: Record<string, unknown>[] = []
  for (const item of items) {
    const data = {
      setupId: params.setupId,
      tableProfileId: item.tableProfileId,
      x: item.x ?? 0,
      y: item.y ?? 0,
      rotation: item.rotation ?? 0,
      sectionId: item.sectionId ?? null,
      tableGroupId: item.tableGroupId ?? null,
      assignedNumber: item.assignedNumber ?? null,
      label: item.label ?? null,
      chairEdges: item.chairEdges ?? undefined,
      sortOrder: item.sortOrder ?? 0,
      isActive: item.isActive ?? true,
    }

    if (item.id && existingIds.has(item.id)) {
      const updated = await prisma.setupItem.update({ where: { id: item.id }, data })
      results.push({ id: updated.id, _clientId: item._clientId ?? item.id })
    } else {
      const created = await prisma.setupItem.create({ data })
      results.push({ id: created.id, _clientId: item._clientId ?? item.id })
    }
  }

  return NextResponse.json({ saved: results, deleted: toDelete.length })
}
