import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { generateApiKey, hashApiKey } from '@/lib/public-api'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId = new URL(req.url).searchParams.get('venueId')
  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId || session.user.venueId

  const keys = await prisma.apiKey.findMany({
    where: { deletedAt: null, venueId: scopedVenueId },
    select: {
      id: true,
      name: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
      keyHash: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    keys.map((k) => ({ ...k, masked: `${k.keyHash.slice(0, 8)}…` })),
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, venueId } = body as { name?: string; venueId?: string }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId || session.user.venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const key = generateApiKey()
  const apiKey = await prisma.apiKey.create({
    data: {
      venueId: scopedVenueId,
      name: (name || 'API KEY').toUpperCase().trim(),
      keyHash: hashApiKey(key),
    },
  })

  // The raw key is shown exactly once — only the hash is stored.
  return NextResponse.json({ id: apiKey.id, name: apiKey.name, key }, { status: 201 })
}
