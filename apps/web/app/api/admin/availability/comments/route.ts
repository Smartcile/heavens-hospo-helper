import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { canAccess, guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds, getManagerVenueId, resolveScopedVenueId } from '@/lib/venue-scope'
import { AVAILABILITY_COMMENT_MAX_LENGTH, isAvailabilityDateKey } from '@/lib/availability-comments'
import { mirrorAvailabilityCommentNotes } from '@/lib/availability-comments.server'

type SessionLike = {
  user: { id: string; role: string; venueId: string; availableVenueIds: string[] }
}

interface CommentRow {
  id: string
  body: string
  source: string
  authorId: string | null
  createdAt: Date
}

/**
 * ADMIN works in the venue selected by the `admin-active-venue` cookie
 * (falling back to home); MANAGER is locked to their effective venue.
 */
function activeVenueId(session: SessionLike, req: NextRequest): string {
  if (session.user.role === 'MANAGER') return getManagerVenueId(session, req) ?? session.user.venueId
  const cookieVenueId = req.cookies.get('admin-active-venue')?.value
  return cookieVenueId && getAccessibleVenueIds(session).includes(cookieVenueId)
    ? cookieVenueId
    : session.user.venueId
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

function serialise(row: CommentRow, names: Map<string, string>, canDelete: boolean) {
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

function parseDate(value: string | null | undefined): string | null {
  return isAvailabilityDateKey(value) ? value : null
}

async function loadComments(venueId: string, staffId: string, dateKey: string, canEdit: boolean) {
  const rows = await prisma.availabilityComment.findMany({
    where: { venueId, staffId, date: new Date(`${dateKey}T00:00:00.000Z`), deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
  })
  const names = await authorNames(rows.map((r) => r.authorId).filter((id): id is string => !!id))
  return rows.map((r) => serialise(r, names, canEdit))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.view')
  if (denied) return denied

  const requested = req.nextUrl.searchParams.get('venueId') ?? activeVenueId(session, req)
  const scoped = resolveScopedVenueId(session, req, requested)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId
  const staffId = req.nextUrl.searchParams.get('staffId')
  const dateKey = parseDate(req.nextUrl.searchParams.get('date'))
  if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!dateKey) return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })

  const staff = await prisma.staff.findFirst({
    where: { id: staffId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })

  // Restricted managers get read-only threads unless they hold the edit grant.
  const canEdit = await canAccess(session, req, 'team.availability.edit')
  return NextResponse.json({
    comments: await loadComments(venueId, staffId, dateKey, canEdit),
    canDelete: canEdit,
    canAdd: canEdit,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    staffId?: string
    date?: string
    body?: string
    seriesId?: string | null
    venueId?: string
  } | null

  const requested = typeof body?.venueId === 'string' ? body.venueId : activeVenueId(session, req)
  const scoped = resolveScopedVenueId(session, req, requested)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId
  const dateKey = parseDate(body?.date)
  if (!body?.staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!dateKey) return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })

  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'COMMENT CANNOT BE EMPTY' }, { status: 400 })
  if (text.length > AVAILABILITY_COMMENT_MAX_LENGTH) {
    return NextResponse.json({ error: `COMMENT IS TOO LONG (MAX ${AVAILABILITY_COMMENT_MAX_LENGTH})` }, { status: 400 })
  }

  const staff = await prisma.staff.findFirst({
    where: { id: body.staffId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })

  const created = await prisma.availabilityComment.create({
    data: {
      venueId,
      staffId: body.staffId,
      date: new Date(`${dateKey}T00:00:00.000Z`),
      seriesId: typeof body.seriesId === 'string' && body.seriesId ? body.seriesId : null,
      body: text,
      source: 'MANAGER',
      authorId: session.user.id,
    },
  })
  await mirrorAvailabilityCommentNotes(body.staffId, dateKey)

  const names = await authorNames(created.authorId ? [created.authorId] : [])
  return NextResponse.json({ comment: serialise(created, names, true) })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { id?: string; venueId?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const requested = typeof body?.venueId === 'string' ? body.venueId : activeVenueId(session, req)
  const scoped = resolveScopedVenueId(session, req, requested)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId
  const comment = await prisma.availabilityComment.findFirst({
    where: { id: body.id, venueId, deletedAt: null },
    select: { id: true, staffId: true, date: true },
  })
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.availabilityComment.update({
    where: { id: comment.id },
    data: { deletedAt: new Date() },
  })
  await mirrorAvailabilityCommentNotes(comment.staffId, comment.date.toISOString().slice(0, 10))

  return NextResponse.json({ success: true })
}
