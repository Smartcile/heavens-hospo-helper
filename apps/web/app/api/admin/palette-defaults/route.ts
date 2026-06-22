import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const defaults = await prisma.paletteDefault.findMany({
    where: { venueId: session.user.venueId },
  })
  return NextResponse.json(defaults)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { items } = await req.json()
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  const venueId = session.user.venueId
  const results: typeof items = []

  for (const item of items) {
    const { type, width, depth, colour, chairCount } = item
    if (!type) continue
    const upserted = await prisma.paletteDefault.upsert({
      where: { venueId_type: { venueId, type } },
      update: { width, depth, colour, chairCount },
      create: { venueId, type, width, depth, colour, chairCount },
    })
    results.push(upserted)
  }

  return NextResponse.json({ saved: results.length })
}
