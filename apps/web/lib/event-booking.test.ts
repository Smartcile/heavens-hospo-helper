import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma, logEventEvent } = vi.hoisted(() => ({
  prisma: {
    event: { findFirst: vi.fn(), update: vi.fn() },
    calendarEvent: { upsert: vi.fn() },
    booking: { create: vi.fn(), update: vi.fn() },
    bookingTable: { deleteMany: vi.fn(), createMany: vi.fn() },
    menuItem: { findMany: vi.fn() },
    wooOrder: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    wooOrderItem: { deleteMany: vi.fn() },
    floorPlanSetup: { findFirst: vi.fn() },
  },
  logEventEvent: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/events.server', () => ({ logEventEvent }))
vi.mock('@/lib/furniture-server', () => ({ resolvePlacedFurniture: vi.fn() }))
vi.mock('@/lib/service-seating', () => ({ planSeatingOnTables: vi.fn() }))
vi.mock('@/lib/service-seating.server', () => ({
  seatFailureMessage: () => 'NOT SEATED',
  seatPartyOnServicePlan: vi.fn(),
  setupOccupiedTableIds: vi.fn(),
}))

import { pushEventToBookings } from './event-booking'

function baseEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    venueId: 'v1',
    name: 'WEDDING',
    eventType: null,
    eventDate: new Date('2026-11-26T00:00:00Z'),
    startTime: '17:00',
    endTime: '23:00',
    guestCount: 80,
    contactName: 'SMITH',
    contactPhone: null,
    contactEmail: null,
    notes: null,
    serviceId: null,
    setupId: null,
    areaId: 'a1',
    bookingId: null,
    blocks: [],
    depositAmount: null,
    customerId: null,
    menuId: null,
    customer: null,
    service: null,
    setup: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.event.update.mockResolvedValue({})
  prisma.booking.create.mockResolvedValue({ id: 'b1' })
  prisma.bookingTable.deleteMany.mockResolvedValue({ count: 0 })
  prisma.menuItem.findMany.mockResolvedValue([])
  prisma.calendarEvent.upsert.mockResolvedValue({ id: 'cal1' })
})

describe('pushEventToBookings — room copy (#189)', () => {
  it('stamps the event room on the calendar event and the booking', async () => {
    prisma.event.findFirst.mockResolvedValue(baseEvent({ areaId: 'a1' }))

    const result = await pushEventToBookings('e1', 'v1')
    expect(result.ok).toBe(true)

    expect(prisma.calendarEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ areaId: 'a1' }),
        create: expect.objectContaining({ areaId: 'a1' }),
      }),
    )
    expect(prisma.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ areaId: 'a1' }),
    })
  })

  it('falls back to the chosen setup’s room when the event has none', async () => {
    prisma.event.findFirst.mockResolvedValue(
      baseEvent({
        areaId: null,
        setupId: 's1',
        setup: { id: 's1', name: 'LAYOUT', areaId: 'a2', floorPlan: { slug: 'main' } },
      }),
    )

    await pushEventToBookings('e1', 'v1')

    expect(prisma.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ areaId: 'a2' }),
    })
  })
})
