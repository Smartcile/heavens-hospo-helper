import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { isDateLocked, isPastDate } from '@/lib/availability'

// Clear one day's availability (soft delete). Ownership is enforced; a miss
// returns 404 so existence is not leaked. APPROVED and past/locked days are
// protected — the worker UI files an edit request for those instead.
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
