import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// All clock-edit audit rows in a date range (the VIEW EDITS modal).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId = req.nextUrl.searchParams.get('venueId') || session.user.venueId
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 500)

  const where: Record<string, unknown> = {
    timeClock: { venueId, deletedAt: null },
  }
  if (from) {
    const start = new Date(from)
    where.editedAt = { ...(where.editedAt as Record<string, unknown> ?? {}), gte: start }
  }
  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    where.editedAt = { ...(where.editedAt as Record<string, unknown> ?? {}), lte: end }
  }

  const edits = await prisma.timeClockEdit.findMany({
    where,
    include: {
      timeClock: {
        select: {
          clockIn: true,
          staff: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { editedAt: 'desc' },
    take: Math.min(limit, 2000),
  })

  return NextResponse.json(edits)
}
