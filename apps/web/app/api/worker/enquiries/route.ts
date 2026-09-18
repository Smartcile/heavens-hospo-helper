import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { createEnquiry } from '@/lib/enquiries.server'
import { loadBlockLibrary } from '@/lib/beo-block-defs.server'

/**
 * POST /api/worker/enquiries — start an enquiry from the master template. The
 * venue is always the worker's own; no client venue is trusted.
 */
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const rawDate = String(body.eventDate ?? '')
  const eventDate = new Date(`${rawDate}T00:00:00Z`)
  if (!rawDate || Number.isNaN(eventDate.getTime())) {
    return NextResponse.json({ error: 'Enquiry date is required' }, { status: 400 })
  }

  const venueId = session!.venueId
  const library = await loadBlockLibrary(venueId)
  const enquiry = await createEnquiry(
    venueId,
    {
      name,
      eventDate,
      eventType: (body.eventType as string | undefined) ?? null,
      guestCount: body.guestCount == null ? null : Number(body.guestCount),
      contactName: (body.contactName as string | undefined) ?? null,
      contactEmail: (body.contactEmail as string | undefined) ?? null,
      contactPhone: (body.contactPhone as string | undefined) ?? null,
    },
    library,
  )
  return NextResponse.json(enquiry, { status: 201 })
}
