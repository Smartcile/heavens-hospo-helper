import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getTodayDate } from '@/lib/utils'

interface Params {
  params: { id: string }
}

async function loadChecklist(req: NextRequest, params: { id: string }) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = await guardAccess(session, req, 'execution.tasks.edit')
  if (denied) return { error: denied }

  const existing = await prisma.checklist.findUnique({ where: { id: params.id }, select: { venueId: true, deletedAt: true } })
  if (!existing || existing.deletedAt) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { existing }
}

// Force a not-yet-open list open for the rest of the venue's current day.
// The stamp is a venue-local date, so the time gate returns automatically the
// next day — no cron needed.
export async function POST(req: NextRequest, { params }: Params) {
  const res = await loadChecklist(req, params)
  if ('error' in res) return res.error

  const venue = await prisma.venue.findUnique({ where: { id: res.existing.venueId }, select: { timezone: true } })
  const checklist = await prisma.checklist.update({
    where: { id: params.id },
    data: { activatedOn: getTodayDate(venue?.timezone) },
  })
  return NextResponse.json(checklist)
}

// Undo today's activation — the list falls back to its appear-from time.
export async function DELETE(req: NextRequest, { params }: Params) {
  const res = await loadChecklist(req, params)
  if ('error' in res) return res.error

  const checklist = await prisma.checklist.update({
    where: { id: params.id },
    data: { activatedOn: null },
  })
  return NextResponse.json(checklist)
}
