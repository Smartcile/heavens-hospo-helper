import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getWorkerSession, workerMayManageEvents, areaVisible } = vi.hoisted(() => ({
  prisma: {
    event: { findFirst: vi.fn(), update: vi.fn() },
  },
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
    data: body.areaId !== undefined ? { areaId: body.areaId } : {},
  }),
  eventInclude: {},
  logEventEvent: vi.fn(),
}))

import { PUT } from '@/app/api/worker/events/[id]/route'

const params = { params: { id: 'e1' } }

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/worker/events/e1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1' })
  workerMayManageEvents.mockResolvedValue(true)
  areaVisible.mockResolvedValue(false)
  prisma.event.findFirst.mockResolvedValue({ id: 'e1', status: 'DRAFT', venueId: 'v1' })
  prisma.event.update.mockResolvedValue({ id: 'e1' })
})

describe('PUT /api/worker/events/[id] — room scope (#189)', () => {
  it('rejects an area that is not owned by or shared into the worker venue', async () => {
    const res = await PUT(request({ areaId: 'other-tenant-area' }), params)
    expect(res.status).toBe(400)
    expect(areaVisible).toHaveBeenCalledWith('other-tenant-area', 'v1')
    expect(prisma.event.update).not.toHaveBeenCalled()
  })

  it('accepts a shared room', async () => {
    areaVisible.mockResolvedValue(true)
    const res = await PUT(request({ areaId: 'shared-room' }), params)
    expect(res.status).toBe(200)
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ areaId: 'shared-room' }),
      include: {},
    })
  })
})
