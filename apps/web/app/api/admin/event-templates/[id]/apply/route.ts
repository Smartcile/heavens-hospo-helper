import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { createEventFromTemplate } from '@/lib/events.server'
import { loadBlockLibrary } from '@/lib/beo-block-defs.server'

type Params = { params: { id: string } }

/**
 * POST /api/admin/event-templates/[id]/apply — create an event from a template.
 * Body: { venueId?, name, eventDate, eventType?, guestCount?, diningStyle?,
 *         contactName?, contactEmail?, contactPhone? }.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.create')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venueId = typeof body.venueId === 'string' ? body.venueId : undefined
  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const rawDate = String(body.eventDate ?? '')
  const eventDate = new Date(`${rawDate}T00:00:00Z`)
  if (!rawDate || Number.isNaN(eventDate.getTime())) {
    return NextResponse.json({ error: 'Event date is required' }, { status: 400 })
  }

  const library = await loadBlockLibrary(scopedVenueId)
  const event = await createEventFromTemplate(
    params.id,
    scopedVenueId,
    {
      name,
      eventDate,
      eventType: (body.eventType as string | undefined) ?? null,
      guestCount: body.guestCount == null ? null : Number(body.guestCount),
      diningStyle: (body.diningStyle as string | undefined) ?? null,
      contactName: (body.contactName as string | undefined) ?? null,
      contactEmail: (body.contactEmail as string | undefined) ?? null,
      contactPhone: (body.contactPhone as string | undefined) ?? null,
    },
    library,
  )
  if (!event) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  return NextResponse.json(event, { status: 201 })
}
