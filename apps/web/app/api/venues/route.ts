import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const venues = await prisma.venue.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(venues)
}
