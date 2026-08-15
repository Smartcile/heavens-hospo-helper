import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const denied = await guardAccess(session, req, 'floorplans.plans.view')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const venueId = searchParams.get('venueId')

    const where: Record<string, unknown> = {
      deletedAt: null,
    }
    if (session.user.role === 'MANAGER' && session.user.venueId) {
      where.venueId = session.user.venueId
    } else if (venueId) {
      where.venueId = venueId
    }

    const plans = await prisma.floorPlan.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        isDefault: true,
        roomWidth: true,
        roomDepth: true,
        gridUnit: true,
        isActive: true,
        createdAt: true,
        _count: { select: { elements: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json(plans)
  } catch (e: any) {
    console.error('GET /api/admin/floorplan error:', e)
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const denied = await guardAccess(session, req, 'floorplans.plans.edit')
    if (denied) return denied

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
    const { venueId, name, slug, roomWidth, roomDepth, gridUnit } = body

    if (!venueId || !name?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: 'venueId, name, and slug are required' }, { status: 400 })
    }

    if (session.user.role === 'MANAGER' && venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check slug uniqueness within venue (including soft-deleted records
    // since the DB unique constraint covers them too)
    const existing = await prisma.floorPlan.findFirst({
      where: { venueId, slug: slug.trim().toLowerCase() },
    })

    if (existing) {
      if (existing.deletedAt) {
        // Restore the soft-deleted plan with the same slug
        const plan = await prisma.floorPlan.update({
          where: { id: existing.id },
          data: {
            name: String(name).toUpperCase().trim(),
            roomWidth: roomWidth ?? 2000,
            roomDepth: roomDepth ?? 1500,
            gridUnit: gridUnit ?? 50,
            deletedAt: null,
          },
        })
        return NextResponse.json(plan, { status: 201 })
      }
      return NextResponse.json({ error: 'A plan with this slug already exists for this venue' }, { status: 409 })
    }

    // If first plan for venue, auto-set as default
    const count = await prisma.floorPlan.count({ where: { venueId, deletedAt: null } })

    const plan = await prisma.floorPlan.create({
      data: {
        venueId,
        name: String(name).toUpperCase().trim(),
        slug: slug.trim().toLowerCase(),
        isDefault: count === 0,
        roomWidth: roomWidth ?? 2000,
        roomDepth: roomDepth ?? 1500,
        gridUnit: gridUnit ?? 50,
      },
    })

    return NextResponse.json(plan, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/admin/floorplan error:', e)
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
