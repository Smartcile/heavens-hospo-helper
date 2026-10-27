import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { getTodayDate } from '@/lib/utils'
import type { WorkerSession } from '@hospo-ops/types'

interface Params {
  params: { id: string }
}

async function loadChecklist(session: WorkerSession, params: { id: string }) {
  const existing = await prisma.checklist.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (existing.venueId !== session.venueId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { existing }
}

// Force a not-yet-open list open for the rest of the venue's current day.
// Mirrors the admin route: the stamp is a venue-local date, so the time gate
// returns automatically the next day — no cron needed.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canEditList) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const res = await loadChecklist(session, params)
  if ('error' in res) return res.error

  const venue = await prisma.venue.findUnique({ where: { id: res.existing.venueId }, select: { timezone: true } })
  const checklist = await prisma.checklist.update({
    where: { id: params.id },
    data: { activatedOn: getTodayDate(venue?.timezone) },
  })
  return NextResponse.json(checklist)
}

// Undo today's activation — the list falls back to its appear-from time.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canEditList) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const res = await loadChecklist(session, params)
  if ('error' in res) return res.error

  const checklist = await prisma.checklist.update({
    where: { id: params.id },
    data: { activatedOn: null },
  })
  return NextResponse.json(checklist)
}
