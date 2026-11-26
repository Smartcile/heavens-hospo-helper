import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'
import { buildTipsPeriodPayload } from '@/lib/tips.server'
import { sortTipsShares, type TipsSort, type TipsSortKey } from '@/lib/tips'
import { generateTipsPdf, tipsPdfToBuffer } from '@/lib/tips-pdf'
import { sanitisePdfFilename } from '@/lib/pdf-actions'

interface Params {
  params: { id: string }
}

const day = (d: Date) => d.toISOString().slice(0, 10)

const SORT_KEYS: readonly TipsSortKey[] = ['name', 'hours', 'weight', 'department']

/** Read a validated sort from the query so the PDF matches the on-screen order. */
function sortFromRequest(req: NextRequest): TipsSort | null {
  const key = req.nextUrl.searchParams.get('sort')
  if (!key || !SORT_KEYS.includes(key as TipsSortKey)) return null
  return { key: key as TipsSortKey, dir: req.nextUrl.searchParams.get('dir') === 'desc' ? 'desc' : 'asc' }
}

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
        include: { staff: { select: { department: { select: { name: true } } } } },
      },
    },
  })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const includeNotes = req.nextUrl.searchParams.get('notes') === '1'
  // Notes are ONLY loaded when explicitly requested; the default PDF download
  // never joins the thread table.
  const notesById = new Map<string, string[]>()
  if (includeNotes) {
    const shareIds = period.shares.map((s) => s.id)
    const notes = shareIds.length
      ? await prisma.tipsShareNote.findMany({
          where: { tipsShareId: { in: shareIds }, deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { updatedAt: 'asc' }],
          select: { tipsShareId: true, body: true },
        })
      : []
    for (const note of notes) {
      const list = notesById.get(note.tipsShareId) ?? []
      list.push(note.body)
      notesById.set(note.tipsShareId, list)
    }
  }
  const payload = buildTipsPeriodPayload(period)
  const orderedShares = sortTipsShares(payload.shares, sortFromRequest(req))
  const label = period.label || `${day(period.fromDate)} - ${day(period.toDate)}`
  const doc = generateTipsPdf({
    venueName: period.venue.name,
    label,
    fromDate: day(period.fromDate),
    toDate: day(period.toDate),
    poolTotal: payload.poolTotal,
    includeNotes,
    shares: orderedShares.map((s) => ({
      name: s.name,
      department: s.departmentName,
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
