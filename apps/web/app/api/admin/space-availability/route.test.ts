import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, canAccess } = vi.hoisted(() => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    area: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
    booking: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))

import { GET } from '@/app/api/admin/space-availability/route'

function request(date = '2026-11-26'): NextRequest {
  return new NextRequest(`http://localhost/api/admin/space-availability?venueId=v1&date=${date}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(true)
  getServerSession.mockResolvedValue({
    user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  prisma.area.findMany.mockResolvedValue([
    { id: 'a1', name: 'FUNCTION ROOM', colour: null, venueId: 'v2', sortOrder: 0 },
  ])
  prisma.calendarEvent.findMany.mockResolvedValue([])
  prisma.booking.findMany.mockResolvedValue([])
})

describe('GET /api/admin/space-availability', () => {
  it('merges events + bookings per room and uses the union room predicate', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'e1', title: 'WEDDING', areaId: 'a1', startsAt: new Date('2026-11-26T17:00:00Z'), endsAt: new Date('2026-11-26T23:00:00Z'), allDay: false, pax: 80, source: 'MANUAL' },
    ])
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', contactName: 'SMITH', areaId: 'a1', date: new Date('2026-11-26T00:00:00Z'), startTime: '18:00', endTime: '20:00', partySize: 6, status: 'CONFIRMED', source: 'PHONE', calendarEventId: null },
    ])

    const res = await GET(request())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rooms[0].items.map((i: { kind: string }) => i.kind)).toEqual(['EVENT', 'BOOKING'])
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { venueId: 'v1' },
                expect.objectContaining({
                  area: expect.objectContaining({
                    OR: expect.arrayContaining([
                      { venueId: { in: ['v1'] } },
                      { venueLinks: { some: { venueId: { in: ['v1'] }, deletedAt: null } } },
                    ]),
                  }),
                }),
              ],
            }),
          ]),
        }),
      }),
    )
  })

  it('treats a missing end as open-ended (began yesterday still shows today)', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'e1', title: 'HOLD', areaId: 'a1', startsAt: new Date('2026-11-25T09:00:00Z'), endsAt: null, allDay: false, pax: null, source: 'MANUAL' },
    ])
    const res = await GET(request())
    const body = await res.json()
    expect(body.rooms[0].items).toHaveLength(1)
    const where = prisma.calendarEvent.findMany.mock.calls[0][0].where
    expect(where.AND[0].OR).toContainEqual({ endsAt: null, startsAt: { lt: new Date('2026-11-27T00:00:00Z') } })
  })

  it('masks booking contact names without bookings.bookings.view', async () => {
    canAccess.mockResolvedValue(false)
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', contactName: 'SMITH', areaId: 'a1', date: new Date('2026-11-26T00:00:00Z'), startTime: '18:00', endTime: '20:00', partySize: 6, status: 'CONFIRMED', source: 'PHONE', calendarEventId: null },
    ])
    const res = await GET(request())
    const body = await res.json()
    expect(body.rooms[0].items[0].title).toBe('RESERVED')
  })
})
