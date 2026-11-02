import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { BEO_STATUS_VALUES, convertEnquiry } from '@/lib/enquiries.server'

type Params = { params: { id: string } }

/** POST /api/worker/events/[id]/convert — turn the worker venue's enquiry into a BEO. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const requested = String(body.status ?? 'TENTATIVE').toUpperCase()
  const status = (BEO_STATUS_VALUES as readonly string[]).includes(requested)
    ? (requested as (typeof BEO_STATUS_VALUES)[number])
    : 'TENTATIVE'

  const event = await convertEnquiry(params.id, session!.venueId, status)
  if (!event) {
    return NextResponse.json({ error: 'Not an enquiry in this venue' }, { status: 404 })
  }
  return NextResponse.json(event)
}
