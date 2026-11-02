import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { recalcBreaksMinutes } from '@/lib/timeclock-breaks'

// POST: start a break on the active session (409 when not clocked in or
// already on break). PATCH: end the active break.
export async function POST() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const active = await prisma.timeClock.findFirst({
    where: { staffId: session.staffId, isActive: true, deletedAt: null },
  })
  if (!active) {
    return NextResponse.json({ error: 'NOT CLOCKED IN' }, { status: 409 })
  }

  const openBreak = await prisma.timeClockBreak.findFirst({
    where: { timeClockId: active.id, endAt: null, deletedAt: null },
  })
  if (openBreak) {
    return NextResponse.json({ error: 'ALREADY ON BREAK' }, { status: 409 })
  }

  const br = await prisma.timeClockBreak.create({
    data: { timeClockId: active.id, startAt: new Date() },
  })

  return NextResponse.json(br, { status: 201 })
}

export async function PATCH() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const active = await prisma.timeClock.findFirst({
    where: { staffId: session.staffId, isActive: true, deletedAt: null },
  })
  if (!active) {
    return NextResponse.json({ error: 'NOT CLOCKED IN' }, { status: 409 })
  }

  const openBreak = await prisma.timeClockBreak.findFirst({
    where: { timeClockId: active.id, endAt: null, deletedAt: null },
  })
  if (!openBreak) {
    return NextResponse.json({ error: 'NOT ON BREAK' }, { status: 409 })
  }

  const br = await prisma.timeClockBreak.update({
    where: { id: openBreak.id },
    data: { endAt: new Date() },
  })

  await recalcBreaksMinutes(active.id)

  return NextResponse.json(br)
}
