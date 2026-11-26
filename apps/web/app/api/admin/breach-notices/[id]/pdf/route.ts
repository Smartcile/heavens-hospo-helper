import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { breachNoticePdfFilename } from '@/lib/breach-notice-pdf'
import { breachNoticePdfRow, buildBreachNoticePdfBuffer } from '@/lib/breach-notice-pdf.server'

type Params = { params: { id: string } }

/** GET /api/admin/breach-notices/[id]/pdf?inline=1 */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.breaches.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req, req.nextUrl.searchParams.get('venueId'))
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = await prisma.breachNotice.findFirst({
    where: { id: params.id, venueId: scoped.venueId, deletedAt: null },
    include: {
      venue: { select: { name: true } },
      submittedBy: { select: { firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
  })
  if (!row) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  const buffer = await buildBreachNoticePdfBuffer(breachNoticePdfRow(row))
  const filename = breachNoticePdfFilename(row.numberplate, row.breachDate.toISOString().slice(0, 10))

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.nextUrl.searchParams.get('inline') === '1' ? 'inline' : 'attachment'}; filename="${filename}"`,
    },
  })
}
