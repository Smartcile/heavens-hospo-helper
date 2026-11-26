import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getWorkerSession, workerMayManageEvents, areaVisible } = vi.hoisted(() => ({
  prisma: { event: { create: vi.fn() } },
  getWorkerSession: vi.fn(),
  workerMayManageEvents: vi.fn(),
  areaVisible: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma, Prisma: {} }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-event-access', () => ({ workerMayManageEvents }))
vi.mock('@/lib/area-scope.server', () => ({ areaVisibleToVenue: areaVisible }))
vi.mock('@/lib/events.server', () => ({
  buildEventData: (body: Record<string, unknown>) => ({
    data: {
      name: body.name ?? 'EVENT',
      eventDate: new Date('2026-11-26T00:00:00Z'),
      ...(body.areaId !== undefined ? { areaId: body.areaId } : {}),
    },
  }),
  eventInclude: {},
}))

import { POST } from '@/app/api/worker/events/route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/worker/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1' })
  workerMayManageEvents.mockResolvedValue(true)
  areaVisible.mockResolvedValue(false)
  prisma.event.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'e1', ...(data as object) }))
})

describe('POST /api/worker/events — room scope (#189)', () => {
  it('rejects an area that is not owned by or shared into the worker venue', async () => {
    const res = await POST(request({ name: 'WEDDING', eventDate: '2026-11-26', areaId: 'other-tenant-area' }))
    expect(res.status).toBe(400)
    expect(areaVisible).toHaveBeenCalledWith('other-tenant-area', 'v1')
    expect(prisma.event.create).not.toHaveBeenCalled()
  })

  it('accepts a shared room', async () => {
    areaVisible.mockResolvedValue(true)
    const res = await POST(request({ name: 'WEDDING', eventDate: '2026-11-26', areaId: 'shared-room' }))
    expect(res.status).toBe(201)
    expect(prisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ areaId: 'shared-room', venueId: 'v1' }),
      include: {},
    })
  })
})
