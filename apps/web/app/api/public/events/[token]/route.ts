import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { eventByShareToken } from '@/lib/events.server'
import { buildPublicEventView } from '@/lib/event-share'
import { computeEventTotals, type EventBlockLike } from '@/lib/event-pricing'

type Params = { params: { token: string } }

/**
 * GET /api/public/events/[token] — the customer's read-only BEO view.
 * Unauthenticated: the opaque token IS the credential. Returns 404 for a
 * disabled, rotated, expired or deleted link.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const event = await eventByShareToken(params.token)
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const menuItems = await prisma.menuItem.findMany({
    where: { venueId: event.venueId, deletedAt: null },
    select: { id: true, name: true, price: true },
  })
  const totals = computeEventTotals(
    event.blocks as unknown as EventBlockLike[],
    menuItems,
    event.depositAmount,
  )

  return NextResponse.json(
    buildPublicEventView({
      name: event.name,
      eventType: event.eventType,
      status: event.status,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      guestCount: event.guestCount,
      diningStyle: event.diningStyle,
      contactName: event.contactName,
      customerApprovedAt: event.customerApprovedAt,
      customerApprovedByName: event.customerApprovedByName,
      blocks: event.blocks.map((b) => ({
        id: b.id,
        type: b.type,
        title: b.title,
        config: b.config,
        sortOrder: b.sortOrder,
      })),
      venueName: event.venue.name,
      menuName: event.menu?.name ?? null,
      setupName: event.setup?.name ?? null,
      menuItems: menuItems.map((m) => ({ id: m.id, name: m.name })),
      totals,
      requests: event.changeRequests.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        message: r.message,
        responseNote: r.responseNote,
        createdAt: r.createdAt.toISOString(),
      })),
    }),
  )
}
