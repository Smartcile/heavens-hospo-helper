import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { isDateLocked, isPastDate } from '@/lib/availability'

// Notes are always writable by their owner — even on a locked or past day —
// so the worker and manager can keep communicating. The body accepts `notes`
// only; availability fields can never be smuggled through this route.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { notes?: string | null } | null
  if (!body || !('notes' in body)) {
    return NextResponse.json({ error: 'ONLY A NOTE CAN BE UPDATED HERE' }, { status: 400 })
  }

  const existing = await prisma.staffAvailability.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt || existing.staffId !== session.staffId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  const updated = await prisma.staffAvailability.update({ where: { id: params.id }, data: { notes } })
  return NextResponse.json({ success: true, notes: updated.notes })
}

// Clear one day's availability (soft delete). Ownership is enforced; a miss
// returns 404 so existence is not leaked. APPROVED, manager-locked and
// past/locked days are protected — the worker UI files an edit request for
// those instead.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.staffAvailability.findUnique({
    where: { id: params.id },
    include: { venue: { select: { timezone: true, availabilityLockDays: true } } },
  })
  if (!existing || existing.deletedAt || existing.staffId !== session.staffId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.lockedAt) {
    return NextResponse.json({ error: 'THIS DAY IS LOCKED — ASK A MANAGER TO UNLOCK IT' }, { status: 409 })
  }
  if (existing.status === 'APPROVED') {
    return NextResponse.json({ error: 'THIS DAY IS APPROVED — ASK FOR AN EDIT' }, { status: 400 })
  }
  const today = formatDateKey(getTodayDate(existing.venue.timezone))
  if (isPastDate(formatDateKey(existing.date), today) || isDateLocked(formatDateKey(existing.date), existing.venue.availabilityLockDays, today)) {
    return NextResponse.json({ error: 'THIS DAY IS IN THE PAST OR LOCKED' }, { status: 400 })
  }

  await prisma.staffAvailability.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
