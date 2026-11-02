import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import type { SyncDirection, SyncStatus } from '@prisma/client'

const DIRECTIONS = ['PULL', 'PUSH', 'WEBHOOK']
const STATUSES = ['SUCCESS', 'ERROR', 'SKIPPED']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const direction = searchParams.get('direction')
  const status = searchParams.get('status')
  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : (searchParams.get('venueId') || undefined)

  const logs = await prisma.syncLog.findMany({
    where: {
      deletedAt: null,
      // Venue-scoped rows + global rows (e.g. rejected webhooks with no venue match)
      ...(venueId ? { OR: [{ venueId }, { venueId: null }] } : {}),
      ...(direction && DIRECTIONS.includes(direction) ? { direction: direction as SyncDirection } : {}),
      ...(status && STATUSES.includes(status) ? { status: status as SyncStatus } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json(logs)
}
