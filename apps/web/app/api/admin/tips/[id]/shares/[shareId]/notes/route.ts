import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { canAccess, guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds, getManagerVenueId } from '@/lib/venue-scope'
import { TIPS_NOTE_MAX_LENGTH } from '@/lib/tips'

interface RouteParams {
  id: string
  shareId: string
}

interface NoteRow {
  id: string
  body: string
  source: string
  authorId: string | null
  createdAt: Date
}

async function authorNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const rows = await prisma.staff.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true },
  })
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]))
}

function serialise(row: NoteRow, names: Map<string, string>, canDelete: boolean) {
  return {
    id: row.id,
    body: row.body,
    source: row.source,
    authorId: row.authorId,
    authorName: row.authorId ? names.get(row.authorId) ?? null : null,
    createdAt: row.createdAt.toISOString(),
    canDelete,
  }
}

/**
 * The venue is always re-derived from the period — never trusted from the
 * client. MANAGER is locked to their effective venue; an ADMIN must be able to
 * access the period's venue.
 */
async function loadScoped(req: NextRequest, params: RouteParams) {
  const period = await prisma.tipsPeriod.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!period) return { error: 'Not found', status: 404 as const }

  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 as const }
  if (session.user.role === 'MANAGER') {
    const managerVenueId = getManagerVenueId(session, req) ?? session.user.venueId
    if (managerVenueId && period.venueId !== managerVenueId) {
      return { error: 'Forbidden', status: 403 as const }
    }
  } else if (!getAccessibleVenueIds(session).includes(period.venueId)) {
    return { error: 'Forbidden', status: 403 as const }
  }

  const share = await prisma.tipsShare.findFirst({
    where: { id: params.shareId, tipsPeriodId: params.id, deletedAt: null },
    select: { id: true },
  })
  if (!share) return { error: 'Not found', status: 404 as const }

  return { period, share, session }
}

/**
 * GET /api/admin/tips/[id]/shares/[shareId]/notes
 * A per-person, per-period history thread. Notes are deliberately editable even
 * on a locked period (the availability precedent): they never touch money or a
 * payout state.
 */
export async function GET(req: NextRequest, { params }: { params: RouteParams }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.view')
  if (denied) return denied

  const scoped = await loadScoped(req, params)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const canEdit = await canAccess(session, req, 'performance.tips.edit')
  const rows = await prisma.tipsShareNote.findMany({
    where: {
      venueId: scoped.period.venueId,
      tipsPeriodId: params.id,
      tipsShareId: scoped.share.id,
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
  })
  const names = await authorNames(rows.map((r) => r.authorId).filter((id): id is string => !!id))

  return NextResponse.json({
    notes: rows.map((r) => serialise(r, names, canEdit)),
    canAdd: canEdit,
    canDelete: canEdit,
  })
}

export async function POST(req: NextRequest, { params }: { params: RouteParams }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.edit')
  if (denied) return denied

  const scoped = await loadScoped(req, params)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const body = (await req.json().catch(() => null)) as { body?: string } | null
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'NOTE CANNOT BE EMPTY' }, { status: 400 })
  if (text.length > TIPS_NOTE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `NOTE IS TOO LONG (MAX ${TIPS_NOTE_MAX_LENGTH})` },
      { status: 400 },
    )
  }

  const created = await prisma.tipsShareNote.create({
    data: {
      venueId: scoped.period.venueId,
      tipsPeriodId: params.id,
      tipsShareId: scoped.share.id,
      body: text,
      source: 'MANAGER',
      authorId: session.user.id,
    },
  })
  const names = await authorNames(created.authorId ? [created.authorId] : [])

  return NextResponse.json({ note: serialise(created, names, true) })
}

export async function DELETE(req: NextRequest, { params }: { params: RouteParams }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.edit')
  if (denied) return denied

  const scoped = await loadScoped(req, params)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const body = (await req.json().catch(() => null)) as { id?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const note = await prisma.tipsShareNote.findFirst({
    where: {
      id: body.id,
      venueId: scoped.period.venueId,
      tipsPeriodId: params.id,
      tipsShareId: scoped.share.id,
      deletedAt: null,
    },
    select: { id: true },
  })
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.tipsShareNote.update({
    where: { id: note.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ success: true })
}
