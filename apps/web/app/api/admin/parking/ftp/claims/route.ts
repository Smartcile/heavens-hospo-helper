import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { ftpClaimWhere } from '@/lib/ftp-claims.server'
import { ftpClaimAdminView } from '@/lib/ftp-admin-views'

// Admin plate log for the 4-hour claim flow. The rows are the evidence trail
// when an infringement needs following up.

function dateParam(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const limitRaw = Number(sp.get('limit') ?? 100)
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.round(limitRaw))) : 100
  const offsetRaw = Number(sp.get('offset') ?? 0)
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.round(offsetRaw)) : 0

  const where = ftpClaimWhere(scoped.venueId, {
    typeId: sp.get('typeId'),
    status: sp.get('status'),
    from: dateParam(sp.get('from')),
    to: dateParam(sp.get('to')),
    plate: sp.get('plate'),
  })

  const [claims, total, venue] = await Promise.all([
    prisma.ftpClaim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.ftpClaim.count({ where }),
    prisma.venue.findUnique({ where: { id: scoped.venueId }, select: { timezone: true } }),
  ])

  return NextResponse.json({
    claims: claims.map(ftpClaimAdminView),
    total,
    limit,
    offset,
    timezone: venue?.timezone || 'Pacific/Auckland',
  })
}
