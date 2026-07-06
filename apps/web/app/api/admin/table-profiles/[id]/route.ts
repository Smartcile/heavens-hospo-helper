import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.tableProfile.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { bomItems: { include: { item: { select: { id: true, name: true, unit: true } } } } },
  })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(profile)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.tableProfile.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && profile.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).toUpperCase().trim()
  if (body.type !== undefined) data.type = body.type
  if (body.capacity !== undefined) data.capacity = parseInt(String(body.capacity)) || 0
  if (body.width !== undefined) data.width = parseFloat(String(body.width)) || 80
  if (body.depth !== undefined) data.depth = parseFloat(String(body.depth)) || 80
  if (body.shape !== undefined) data.shape = body.shape
  if (body.colour !== undefined) data.colour = body.colour
  if (body.chairCount !== undefined) data.chairCount = parseInt(String(body.chairCount)) || 0
  if (body.seatingDensity !== undefined) data.seatingDensity = body.seatingDensity ? parseFloat(String(body.seatingDensity)) : null
  if (body.maxHeadChairs !== undefined) data.maxHeadChairs = parseInt(String(body.maxHeadChairs)) || 1
  if (body.tableNumbers !== undefined) {
    if (Array.isArray(body.tableNumbers) && body.tableNumbers.length > 0) data.tableNumbers = body.tableNumbers
  }

  const updated = await prisma.tableProfile.update({
    where: { id: params.id },
    data,
    include: { bomItems: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.tableProfile.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && profile.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.tableProfile.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })
  return NextResponse.json({ success: true })
}
