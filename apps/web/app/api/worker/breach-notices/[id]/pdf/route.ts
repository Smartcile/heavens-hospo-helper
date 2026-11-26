import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerBreachAccess } from '@/lib/worker-breach-access'
import { breachNoticePdfFilename } from '@/lib/breach-notice-pdf'
import { breachNoticePdfRow, buildBreachNoticePdfBuffer } from '@/lib/breach-notice-pdf.server'

type Params = { params: { id: string } }

/** GET /api/worker/breach-notices/[id]/pdf?inline=1 — compiled notice sheet. */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerBreachAccess(session)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = await prisma.breachNotice.findFirst({
    where: {
      id: params.id,
      venueId: session.venueId,
      deletedAt: null,
      ...(access.venueWide ? {} : { submittedById: session.staffId }),
    },
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
