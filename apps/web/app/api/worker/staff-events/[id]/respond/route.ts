import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { attendanceFor, validateStaffEventResponse, wallClockNow } from '@/lib/staff-events'

interface Params {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await prisma.staffEvent.findFirst({
    where: { id: params.id, deletedAt: null, venueId: session.venueId },
    select: {
      id: true, venueId: true, status: true, allowMaybe: true, requireDeclineReason: true,
      startsAt: true, endsAt: true, responseDeadline: true,
      venue: { select: { timezone: true } },
    },
  })
  if (!event) return NextResponse.json({ error: 'EVENT NOT FOUND' }, { status: 404 })

  const invite = await prisma.staffEventInvite.findUnique({
    where: { staffEventId_staffId: { staffEventId: event.id, staffId: session.staffId } },
    select: { id: true, deletedAt: true },
  })
  if (!invite || invite.deletedAt) return NextResponse.json({ error: 'YOU ARE NOT INVITED TO THIS EVENT' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { response?: unknown; reason?: unknown }
  const result = validateStaffEventResponse(event, body, wallClockNow(new Date(), event.venue?.timezone))
  if (!result.ok) {
    const status = result.error.includes('DEADLINE') || result.error.includes('NOT OPEN') ? 409 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  await prisma.staffEventInvite.update({
    where: { id: invite.id },
    data: { response: result.response, reason: result.reason, respondedAt: new Date() },
  })

  const all = await prisma.staffEventInvite.findMany({
    where: { staffEventId: event.id, deletedAt: null },
    select: { response: true },
  })

  return NextResponse.json({
    success: true,
    response: result.response,
    reason: result.reason,
    attendance: attendanceFor(all),
  })
}
