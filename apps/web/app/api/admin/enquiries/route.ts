import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { createEnquiry } from '@/lib/enquiries.server'
import { loadBlockLibrary } from '@/lib/beo-block-defs.server'
import { eventInclude } from '@/lib/events.server'

/**
 * GET  /api/admin/enquiries?venueId= — this venue's enquiries (status ENQUIRY).
 * POST /api/admin/enquiries         — start an enquiry from the master template.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.view')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : params.get('venueId') ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const enquiries = await prisma.event.findMany({
    where: { venueId, status: 'ENQUIRY', deletedAt: null },
    include: eventInclude,
    orderBy: [{ eventDate: 'desc' }, { startTime: 'asc' }],
    take: 200,
  })
  return NextResponse.json(enquiries)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.create')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : typeof body.venueId === 'string'
        ? body.venueId
        : session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const rawDate = String(body.eventDate ?? '')
  const eventDate = new Date(`${rawDate}T00:00:00Z`)
  if (!rawDate || Number.isNaN(eventDate.getTime())) {
    return NextResponse.json({ error: 'Enquiry date is required' }, { status: 400 })
  }

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
