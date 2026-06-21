import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
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
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { venueId, name, slug, roomWidth, roomDepth, gridUnit } = body

  if (!venueId || !name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'venueId, name, and slug are required' }, { status: 400 })
  }

  if (session.user.role === 'MANAGER' && venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check slug uniqueness within venue
  const existing = await prisma.floorPlan.findFirst({
    where: { venueId, slug: slug.trim().toLowerCase(), deletedAt: null },
  })
  if (existing) {
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
}
