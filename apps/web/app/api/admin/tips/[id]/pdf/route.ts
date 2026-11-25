import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'
import { buildTipsPeriodPayload } from '@/lib/tips.server'
import { generateTipsPdf, tipsPdfToBuffer } from '@/lib/tips-pdf'
import { sanitisePdfFilename } from '@/lib/pdf-actions'

interface Params {
  params: { id: string }
}

const day = (d: Date) => d.toISOString().slice(0, 10)

/** GET /api/admin/tips/[id]/pdf — admin-only distribution sheet. */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.view')
  if (denied) return denied

  const period = await prisma.tipsPeriod.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER'
        ? { venueId: getManagerVenueId(session, req) ?? session.user.venueId }
        : {}),
    },
    include: {
      venue: { select: { name: true } },
      shares: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          notes: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: 'asc' }, { updatedAt: 'asc' }],
            select: { body: true },
          },
        },
      },
    },
  })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const includeNotes = req.nextUrl.searchParams.get('notes') === '1'
  const notesById = new Map(period.shares.map((s) => [s.id, s.notes.map((n) => n.body)]))
  const payload = buildTipsPeriodPayload(period)
  const label = period.label || `${day(period.fromDate)} - ${day(period.toDate)}`
  const doc = generateTipsPdf({
    venueName: period.venue.name,
    label,
    fromDate: day(period.fromDate),
    toDate: day(period.toDate),
    poolTotal: payload.poolTotal,
    includeNotes,
    shares: payload.shares.map((s) => ({
      name: s.name,
      hours: s.hours,
      shareWeight: s.shareWeight,
      amount: s.amount,
      status: s.status,
      approvalNote: s.approvalNote,
      issueNote: s.issueNote,
      notes: includeNotes ? notesById.get(s.id ?? '') ?? [] : undefined,
    })),
  })

  const inline = req.nextUrl.searchParams.get('inline') === '1'
  const filename = sanitisePdfFilename(`Tips - ${label}.pdf`)
  return new NextResponse(tipsPdfToBuffer(doc), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    },
  })
}
