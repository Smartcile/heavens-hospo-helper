import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    calendarEvent: { findFirst: vi.fn(), update: vi.fn() },
    area: { findFirst: vi.fn() },
    eventStaffing: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/open-shifts.server', () => ({ saveEventStaffing: vi.fn() }))

import { PUT } from '@/app/api/admin/calendar-events/[id]/route'

const params = { params: { id: 'ce1' } }

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/calendar-events/ce1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.calendarEvent.findFirst.mockResolvedValue({
    id: 'ce1',
    venueId: 'v1',
    source: 'MANUAL',
    title: 'WEDDING',
    description: null,
    location: null,
    areaId: null,
    startsAt: new Date('2026-11-26T17:00:00Z'),
    endsAt: new Date('2026-11-26T23:00:00Z'),
    allDay: false,
    pax: 80,
    pdfUrl: null,
  })
  prisma.area.findFirst.mockResolvedValue({ id: 'shared-room', name: 'SHARED ROOM', floorPlan: null })
  prisma.calendarEvent.update.mockResolvedValue({ id: 'ce1', areaId: 'shared-room' })
})

describe('PUT /api/admin/calendar-events/[id] — room sharing', () => {
  it('accepts a room shared into the event’s venue (union check)', async () => {
    const res = await PUT(request({ areaId: 'shared-room' }), params)
    expect(res!.status).toBe(200)
    expect(prisma.area.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'shared-room',
        deletedAt: null,
        OR: [
          { venueId: { in: ['v1'] } },
          { venueLinks: { some: { venueId: { in: ['v1'] }, deletedAt: null } } },
        ],
      },
      select: { id: true, name: true, floorPlan: { select: { slug: true, name: true } } },
    })
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'ce1' },
      data: expect.objectContaining({ areaId: 'shared-room', location: 'SHARED ROOM' }),
    })
  })

  it('rejects a room the venue can neither own nor share', async () => {
    prisma.area.findFirst.mockResolvedValue(null)
    const res = await PUT(request({ areaId: 'other-tenant' }), params)
    expect(res!.status).toBe(400)
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled()
  })
})
