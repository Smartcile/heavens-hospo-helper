import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, prisma } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  prisma: {
    ftpSettings: { findUnique: vi.fn() },
    staffParkingPlate: { findMany: vi.fn() },
    staffParkingPlateRequest: { findMany: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET, POST } from './route'

const SETTINGS = {
  venueId: 'v1',
  staffParkingEnabled: true,
  staffCarparkName: 'STAFF',
  staffCarparkNotes: null,
  deletedAt: null,
}

function post(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/worker/parking/staff-plate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
  prisma.ftpSettings.findUnique.mockResolvedValue(SETTINGS)
  prisma.staffParkingPlate.findMany.mockResolvedValue([])
  prisma.staffParkingPlateRequest.findMany.mockResolvedValue([])
  prisma.staffParkingPlateRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'r1',
    ...data,
  }))
})

describe('GET /api/worker/parking/staff-plate', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it('is silent when staff plates are off', async () => {
    prisma.ftpSettings.findUnique.mockResolvedValue(null)
    expect(await (await GET()).json()).toEqual({ enabled: false })
  })

  it('returns the staff member plates and requests', async () => {
    prisma.staffParkingPlate.findMany.mockResolvedValue([{ id: 'p1', plate: 'ABC123' }])
    const body = await (await GET()).json()
    expect(body.enabled).toBe(true)
    expect(body.plates).toHaveLength(1)
    expect(body.settings.name).toBe('STAFF')
  })
})

describe('POST /api/worker/parking/staff-plate', () => {
  it('refuses when staff plates are off', async () => {
    prisma.ftpSettings.findUnique.mockResolvedValue(null)
    expect((await POST(post({ licensePlate: 'ABC123' }))).status).toBe(403)
  })

  it('requires a note once a plate already exists', async () => {
    prisma.staffParkingPlate.findMany
      .mockResolvedValueOnce([{ id: 'p1', plate: 'OLD1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([])
    const res = await POST(post({ licensePlate: 'NEW99' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('NOTE')
  })

  it('creates a pending add request', async () => {
    const res = await POST(post({ licensePlate: 'abc123', reason: 'first car' }))
    expect(res.status).toBe(200)
    expect(prisma.staffParkingPlateRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        staffId: 's1',
        plate: 'ABC123',
        previousPlate: null,
        reason: 'first car',
        status: 'PENDING',
      }),
    })
  })

  it('captures the previous plate when changing a plate', async () => {
    prisma.staffParkingPlate.findMany
      .mockResolvedValueOnce([{ id: 'p1', plate: 'OLD1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([])
    const res = await POST(
      post({ licensePlate: 'NEW99', reason: 'new car', replacePlateId: 'p1' }),
    )
    expect(res.status).toBe(200)
    expect(prisma.staffParkingPlateRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ previousPlate: 'OLD1', plate: 'NEW99' }),
    })
  })

  it("refuses another staff member's plate", async () => {
    prisma.staffParkingPlate.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ staffId: 's2', plate: 'ABC123' }])
    const res = await POST(post({ licensePlate: 'ABC123', reason: 'mine now' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('ANOTHER STAFF MEMBER')
  })
})
