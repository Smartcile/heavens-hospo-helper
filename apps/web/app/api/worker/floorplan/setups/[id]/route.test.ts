import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: {
    floorPlanSetup: { findFirst: vi.fn(), update: vi.fn() },
  },
  getWorkerSession: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/furniture-server', () => ({ resolvePlacedFurniture: vi.fn() }))

import { PUT } from './route'

const req = (body: unknown) =>
  ({ json: async () => body }) as unknown as NextRequest

describe('PUT /api/worker/floorplan/setups/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'MANAGER' })
    prisma.floorPlanSetup.findFirst.mockResolvedValue({ id: 'setup1' })
    prisma.floorPlanSetup.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'setup1',
      ...data,
    }))
  })

  it('rejects floor staff', async () => {
    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })

    const res = await PUT(req({ roomName: 'BAR' }), { params: { id: 'setup1' } })

    expect(res.status).toBe(403)
    expect(prisma.floorPlanSetup.update).not.toHaveBeenCalled()
  })

  it('404s a setup outside the worker venue', async () => {
    prisma.floorPlanSetup.findFirst.mockResolvedValue(null)

    const res = await PUT(req({ roomName: 'BAR' }), { params: { id: 'setup1' } })

    expect(res.status).toBe(404)
    expect(prisma.floorPlanSetup.update).not.toHaveBeenCalled()
  })

  it('normalises room metadata and photos for a manager', async () => {
    const res = await PUT(
      req({
        name: ' main room setup ',
        roomName: ' function room ',
        guestCapacity: '22',
        setupStyle: ' sit down ',
        imageUrls: ['/api/upload/a.jpg', 'javascript:alert(1)'],
        notes: '  ',
      }),
      { params: { id: 'setup1' } },
    )

    expect(prisma.floorPlanSetup.update).toHaveBeenCalledWith({
      where: { id: 'setup1' },
      data: {
        name: 'MAIN ROOM SETUP',
        notes: null,
        roomName: 'FUNCTION ROOM',
        guestCapacity: 22,
        setupStyle: 'SIT DOWN',
        imageUrls: ['/api/upload/a.jpg'],
      },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 'setup1', roomName: 'FUNCTION ROOM' })
  })

  it('rejects a blank setup name', async () => {
    const res = await PUT(req({ name: '   ' }), { params: { id: 'setup1' } })

    expect(res.status).toBe(400)
    expect(prisma.floorPlanSetup.update).not.toHaveBeenCalled()
  })

  it('rejects an empty update', async () => {
    const res = await PUT(req({}), { params: { id: 'setup1' } })

    expect(res.status).toBe(400)
    expect(prisma.floorPlanSetup.update).not.toHaveBeenCalled()
  })
})
