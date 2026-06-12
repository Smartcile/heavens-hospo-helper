import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where = {
    deletedAt: null,
    ...(session.user.role === 'MANAGER' ? { id: session.user.venueId } : {}),
  }

  const venues = await prisma.venue.findMany({
    where,
    include: { departments: { where: { deletedAt: null } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(venues)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, timezone } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const venue = await prisma.venue.create({
    data: {
      name: String(name).toUpperCase().trim(),
      address: address?.trim() ?? null,
      timezone: timezone ?? 'Pacific/Auckland',
    },
  })

  return NextResponse.json(venue, { status: 201 })
}
