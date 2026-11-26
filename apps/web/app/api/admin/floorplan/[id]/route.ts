import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds } from '@/lib/venue-scope'
import { UNDERLAY_MAX_SCALE, UNDERLAY_MIN_SCALE } from '@/lib/floorplan-underlay'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'floorplans.plans.view')
  if (denied) return denied

  const plan = await prisma.floorPlan.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      elements: {
        where: { deletedAt: null, isActive: true },
        orderBy: [{ zIndex: 'asc' }, { sortOrder: 'asc' }],
        include: { inventoryItems: { select: { itemId: true } } },
      },
    },
  })

  if (!plan) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })

  return NextResponse.json(plan)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'floorplans.plans.edit')
  if (denied) return denied

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const existing = await prisma.floorPlan.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })

  // Venue/owner check: the plan must belong to a venue this session can access.
  // ADMIN sees their available venues; a MANAGER is limited to the venues they
  // are assigned to, so a plan from another venue is refused.
  if (!getAccessibleVenueIds(session).includes(existing.venueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const {
    name, slug, isDefault, roomWidth, roomDepth, gridUnit, isActive,
    backgroundImageUrl, backgroundOpacity, backgroundOffsetX, backgroundOffsetY, backgroundScale,
  } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = String(name).toUpperCase().trim()
  if (slug !== undefined) updates.slug = String(slug).trim().toLowerCase()
  if (isDefault !== undefined) updates.isDefault = isDefault
  if (roomWidth !== undefined) updates.roomWidth = roomWidth
  if (roomDepth !== undefined) updates.roomDepth = roomDepth
  if (gridUnit !== undefined) updates.gridUnit = gridUnit
  if (isActive !== undefined) updates.isActive = isActive

  // Reference-image underlay (additive, editor-only fields).
  if (backgroundImageUrl !== undefined) {
    const url = backgroundImageUrl === null ? '' : String(backgroundImageUrl).trim()
    updates.backgroundImageUrl = url.length > 0 ? url : null
  }
  if (backgroundOpacity !== undefined) {
    const value = Number(backgroundOpacity)
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return NextResponse.json({ error: 'backgroundOpacity must be between 0 and 1' }, { status: 400 })
    }
    updates.backgroundOpacity = value
  }
  if (backgroundScale !== undefined) {
    const value = Number(backgroundScale)
    if (!Number.isFinite(value)) {
      return NextResponse.json({ error: 'backgroundScale must be a number' }, { status: 400 })
    }
    // Same scale bounds the editor/lib use; clamp rather than reject so a
    // stale/rounded client value still persists.
    updates.backgroundScale = Math.min(UNDERLAY_MAX_SCALE, Math.max(UNDERLAY_MIN_SCALE, value))
  }
  for (const key of ['backgroundOffsetX', 'backgroundOffsetY'] as const) {
    const raw = body[key]
    if (raw !== undefined) {
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        return NextResponse.json({ error: `${key} must be a number` }, { status: 400 })
      }
      updates[key] = value
    }
  }

  const plan = await prisma.floorPlan.update({
    where: { id: params.id },
    data: updates,
  })

  return NextResponse.json(plan)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'floorplans.plans.edit')
  if (denied) return denied

  await prisma.floorPlan.update({
    where: { id: params.id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  })

  // Soft-delete all elements
  await prisma.floorPlanElement.updateMany({
    where: { floorPlanId: params.id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
