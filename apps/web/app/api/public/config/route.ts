import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { venueFromApiKey } from '@/lib/public-api'

/**
 * Venue config for the WooCommerce plugin: venue basics + every active
 * service with its weekly slots and date exceptions. The plugin renders
 * checkout options from this — it never holds a schedule of its own.
 */
export async function GET(req: NextRequest) {
  const venue = await venueFromApiKey(req)
  if (!venue) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const services = await prisma.service.findMany({
    where: { venueId: venue.id, isActive: true, deletedAt: null },
    include: { slots: true, exceptions: true },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({
    venue: { id: venue.id, name: venue.name, timezone: venue.timezone },
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      wooCategoryId: s.wooCategoryId,
      wooCategoryName: s.wooCategoryName,
      requiresBooking: s.requiresBooking,
      slots: s.slots.map((x) => ({
        dayOfWeek: x.dayOfWeek,
        startTime: x.startTime,
        endTime: x.endTime,
        maxCovers: x.maxCovers,
      })),
      exceptions: s.exceptions.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        closed: e.closed,
        startTime: e.startTime,
        endTime: e.endTime,
        maxCovers: e.maxCovers,
      })),
    })),
  })
}
