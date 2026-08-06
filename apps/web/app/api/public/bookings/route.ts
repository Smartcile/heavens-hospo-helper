import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { venueFromApiKey } from '@/lib/public-api'
import { availabilityForDate } from '@/lib/service-availability'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Booking-only reservations (no payment, no products): validates the slot
 * has enough remaining covers, then creates a Booking on the venue's default
 * setup. No tables are auto-assigned — the venue seats manually.
 */
export async function POST(req: NextRequest) {
  const venue = await venueFromApiKey(req)
  if (!venue) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { serviceId, date, time, partySize, name, phone, email, notes } = body as {
    serviceId?: string
    date?: string
    time?: string
    partySize?: number
    name?: string
    phone?: string
    email?: string
    notes?: string
  }

  if (!serviceId || typeof serviceId !== 'string') {
    return NextResponse.json({ error: 'serviceId is required' }, { status: 400 })
  }
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  if (!time || !TIME_RE.test(time)) {
    return NextResponse.json({ error: 'time must be HH:mm (the slot start)' }, { status: 400 })
  }
  const party = Math.floor(Number(partySize))
  if (!Number.isFinite(party) || party < 1 || party > 500) {
    return NextResponse.json({ error: 'partySize must be 1-500' }, { status: 400 })
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, venueId: venue.id, isActive: true, deletedAt: null },
    include: { slots: true, exceptions: true },
  })
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  const rows = await availabilityForDate(venue.id, date, party)
  const row = rows.find((r) => r.service.id === service.id)
  if (!row || row.resolved.closed) {
    return NextResponse.json({ error: 'Service not running on this date' }, { status: 422 })
  }
  const slot = row.resolved.slots.find((s) => s.startTime === time)
  if (!slot) {
    return NextResponse.json({ error: 'Slot not found for this date' }, { status: 422 })
  }
  const totals = row.totals.find((t) => t.startTime === time)
  if (!totals?.available) {
    return NextResponse.json({ error: 'Slot full — not enough covers left' }, { status: 422 })
  }

  const booking = await prisma.booking.create({
    data: {
      venueId: venue.id,
      date: new Date(date + 'T00:00:00.000Z'),
      startTime: time,
      endTime: slot.endTime,
      partySize: party,
      contactName: name.trim(),
      contactPhone: phone?.trim() || null,
      contactEmail: email?.trim() || null,
      notes: notes?.trim() || null,
      source: 'ONLINE',
      status: 'CONFIRMED',
    },
  })

  return NextResponse.json(
    {
      booking: {
        id: booking.id,
        date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        partySize: booking.partySize,
        status: booking.status,
      },
      remaining: totals.remaining - party,
    },
    { status: 201 },
  )
}
