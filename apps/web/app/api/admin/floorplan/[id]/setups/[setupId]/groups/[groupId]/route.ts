import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params { params: { id: string; setupId: string; groupId: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'floorplans.plans.view')
  if (denied) return denied

  const group = await prisma.tableGroup.findFirst({
    where: { id: params.groupId, deletedAt: null },
    include: {
      items: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, tableProfileId: true, x: true, y: true, rotation: true, label: true },
      },
    },
  })
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(group)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'floorplans.plans.edit')
  if (denied) return denied

  const group = await prisma.tableGroup.findFirst({
    where: { id: params.groupId, deletedAt: null },
    include: { setup: { include: { floorPlan: { select: { venueId: true } } } } },
  })
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && group.setup.floorPlan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, itemIds } = body

  await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.tableGroup.update({ where: { id: params.groupId }, data: { name: name?.trim() || null } })
    }

    if (Array.isArray(itemIds)) {
      // Remove all existing items from group
      await tx.setupItem.updateMany({
        where: { tableGroupId: params.groupId, deletedAt: null },
        data: { tableGroupId: null },
      })
      // Validate and add new items
      const items = await tx.setupItem.findMany({
        where: { id: { in: itemIds }, setupId: params.setupId, deletedAt: null },
        select: { id: true, tableProfileId: true },
      })
      // Ensure same profile
      const profileIds = new Set(items.map((i) => i.tableProfileId))
      if (profileIds.size > 1) {
        throw new Error('All items in a group must have the same table profile')
      }
      await tx.setupItem.updateMany({
        where: { id: { in: itemIds } },
        data: { tableGroupId: params.groupId },
      })
    }
  })

  const updated = await prisma.tableGroup.findFirst({
    where: { id: params.groupId },
    include: {
      items: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, tableProfileId: true, x: true, y: true, rotation: true, label: true },
      },
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'floorplans.plans.edit')
  if (denied) return denied

  const group = await prisma.tableGroup.findFirst({
    where: { id: params.groupId, deletedAt: null },
    include: { setup: { include: { floorPlan: { select: { venueId: true } } } } },
  })
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && group.setup.floorPlan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.setupItem.updateMany({
      where: { tableGroupId: params.groupId, deletedAt: null },
      data: { tableGroupId: null },
    })
    await tx.tableGroup.update({
      where: { id: params.groupId },
      data: { deletedAt: new Date() },
    })
  })

  return NextResponse.json({ success: true })
}
