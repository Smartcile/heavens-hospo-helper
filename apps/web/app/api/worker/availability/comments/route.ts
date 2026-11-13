import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { AVAILABILITY_COMMENT_MAX_LENGTH, isAvailabilityDateKey } from '@/lib/availability-comments'
import { mirrorAvailabilityCommentNotes } from '@/lib/availability-comments.server'

interface CommentRow {
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

function serialise(
  row: CommentRow,
  names: Map<string, string>,
  staffId: string,
  canDeleteOwn: boolean,
) {
  return {
    id: row.id,
    body: row.body,
    source: row.source,
    authorId: row.authorId,
    authorName: row.authorId ? names.get(row.authorId) ?? null : null,
    createdAt: row.createdAt.toISOString(),
    canDelete: canDeleteOwn && row.authorId === staffId,
  }
}

function parseDate(value: string | null | undefined): string | null {
  return isAvailabilityDateKey(value) ? value : null
}

async function staffCanDelete(venueId: string): Promise<boolean> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { staffCanDeleteAvailabilityComments: true },
  })
  return venue?.staffCanDeleteAvailabilityComments === true
}

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dateKey = parseDate(req.nextUrl.searchParams.get('date'))
  if (!dateKey) return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })

  const [rows, canDeleteOwn] = await Promise.all([
    prisma.availabilityComment.findMany({
      where: {
        venueId: session.venueId,
        staffId: session.staffId,
        date: new Date(`${dateKey}T00:00:00.000Z`),
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
    }),
    staffCanDelete(session.venueId),
  ])
  const names = await authorNames(rows.map((r) => r.authorId).filter((id): id is string => !!id))

  return NextResponse.json({
    canDelete: canDeleteOwn,
    canAdd: true,
    comments: rows.map((r) => serialise(r, names, session.staffId, canDeleteOwn)),
  })
}

export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as {
    date?: string
    body?: string
    seriesId?: string | null
  } | null

  const dateKey = parseDate(body?.date)
  if (!dateKey) return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })

  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'COMMENT CANNOT BE EMPTY' }, { status: 400 })
  if (text.length > AVAILABILITY_COMMENT_MAX_LENGTH) {
    return NextResponse.json({ error: `COMMENT IS TOO LONG (MAX ${AVAILABILITY_COMMENT_MAX_LENGTH})` }, { status: 400 })
  }

  const created = await prisma.availabilityComment.create({
    data: {
      venueId: session.venueId,
      staffId: session.staffId,
      date: new Date(`${dateKey}T00:00:00.000Z`),
      seriesId: typeof body?.seriesId === 'string' && body.seriesId ? body.seriesId : null,
      body: text,
      source: 'WORKER_APP',
      authorId: session.staffId,
    },
  })
  await mirrorAvailabilityCommentNotes(session.staffId, dateKey)

  const [names, canDeleteOwn] = await Promise.all([
    authorNames(created.authorId ? [created.authorId] : []),
    staffCanDelete(session.venueId),
  ])
  return NextResponse.json({ comment: serialise(created, names, session.staffId, canDeleteOwn) })
}

export async function DELETE(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { id?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const canDeleteOwn = await staffCanDelete(session.venueId)
  if (!canDeleteOwn) {
    return NextResponse.json({ error: 'DELETING COMMENTS IS A MANAGER ACTION' }, { status: 403 })
  }

  const comment = await prisma.availabilityComment.findFirst({
    where: {
      id: body.id,
      venueId: session.venueId,
      staffId: session.staffId,
      deletedAt: null,
    },
    select: { id: true, staffId: true, date: true, authorId: true },
  })
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (comment.authorId !== session.staffId) {
    return NextResponse.json({ error: 'YOU CAN ONLY DELETE YOUR OWN COMMENTS' }, { status: 403 })
  }

  await prisma.availabilityComment.update({
    where: { id: comment.id },
    data: { deletedAt: new Date() },
  })
  await mirrorAvailabilityCommentNotes(comment.staffId, comment.date.toISOString().slice(0, 10))

  return NextResponse.json({ success: true })
}
