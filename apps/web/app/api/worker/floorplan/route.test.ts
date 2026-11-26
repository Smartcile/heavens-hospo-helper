import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: {
    floorPlan: { findFirst: vi.fn() },
    venue: { findUnique: vi.fn() },
    calendarEvent: { findFirst: vi.fn() },
  },
  getWorkerSession: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { GET } from './route'

describe('GET /api/worker/floorplan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
    prisma.floorPlan.findFirst.mockResolvedValue({
      id: 'plan-1',
      name: 'MAIN',
      slug: 'main',
      roomWidth: 2000,
      roomDepth: 1500,
      gridUnit: 50,
      backgroundImageUrl: '/api/upload/drawing.png',
      backgroundOpacity: 0.35,
      backgroundOffsetX: 0,
      backgroundOffsetY: 0,
      backgroundScale: 1,
      elements: [],
    })
  })

  it('rejects an unauthenticated request', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await GET(new NextRequest('http://localhost/api/worker/floorplan?view=main'))
    expect(res.status).toBe(401)
  })

  it('never exposes the reference-image underlay to the worker view', async () => {
    const res = await GET(new NextRequest('http://localhost/api/worker/floorplan?view=main'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.slug).toBe('main')
    expect(body).not.toHaveProperty('backgroundImageUrl')
    expect(body).not.toHaveProperty('backgroundOpacity')
    expect(body).not.toHaveProperty('backgroundOffsetX')
    expect(body).not.toHaveProperty('backgroundOffsetY')
    expect(body).not.toHaveProperty('backgroundScale')
  })
})
