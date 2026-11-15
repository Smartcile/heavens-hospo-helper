import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { ftpClaimWhere } from '@/lib/ftp-claims.server'

// CSV export of the filtered 4-hour plate log. The admin can send this with the
// per-claim evidence PDFs.

function dateParam(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function localStamp(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const where = ftpClaimWhere(scoped.venueId, {
    typeId: sp.get('typeId'),
    status: sp.get('status'),
    from: dateParam(sp.get('from')),
    to: dateParam(sp.get('to')),
    plate: sp.get('plate'),
  })

  const [claims, venue] = await Promise.all([
    prisma.ftpClaim.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 }),
    prisma.venue.findUnique({ where: { id: scoped.venueId }, select: { timezone: true } }),
  ])
  const timezone = venue?.timezone || 'Pacific/Auckland'

  const header = [
    'Claimed at (local)',
    'Claimed at (UTC ISO)',
    'Parking type',
    'Plate',
    'Credential',
    'Membership number',
    'Name',
    'Email',
    'Phone',
    'Status',
    'Valid from',
    'Valid until',
    'Locations',
    'Claim code',
    'Message',
    'Claim id',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const claim of claims) {
    lines.push(
      [
        localStamp(claim.createdAt, timezone),
        claim.createdAt.toISOString(),
        claim.typeName,
        claim.licensePlate ?? '',
        claim.credentialKind,
        claim.membershipNumber ?? '',
        claim.contactName ?? '',
        claim.contactEmail ?? '',
        claim.contactPhone ?? '',
        claim.status,
        claim.validFrom ?? '',
        claim.validUntil ?? '',
        ((claim.locations as string[] | null) ?? []).join(' · '),
        claim.claimCode ?? '',
        claim.message ?? '',
        claim.id,
      ]
        .map(csvCell)
        .join(','),
    )
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(`\ufeff${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ftp-claims-${stamp}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
