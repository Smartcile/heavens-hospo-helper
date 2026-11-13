import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: { staffParkingPlate: { findUnique: vi.fn(), update: vi.fn() } },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { PATCH } from './route'

const MANAGER = { user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } }
const PLATE = { id: 'p1', venueId: 'v1', plate: 'ABC123', deletedAt: null }

function call(body: Record<string, unknown>) {
  const req = new NextRequest('http://localhost/api/admin/parking/staff-plates/p1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PATCH(req, { params: { id: 'p1' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(MANAGER)
  prisma.staffParkingPlate.findUnique.mockResolvedValue(PLATE)
  prisma.staffParkingPlate.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ ...PLATE, ...data }),
  )
})

describe('PATCH /api/admin/parking/staff-plates/[id]', () => {
  it('404s an unknown plate', async () => {
    prisma.staffParkingPlate.findUnique.mockResolvedValue(null)
    expect((await call({ enteredInSystem: true })).status).toBe(404)
  })

  it('blocks another venue', async () => {
    prisma.staffParkingPlate.findUnique.mockResolvedValue({ ...PLATE, venueId: 'v2' })
    expect((await call({ enteredInSystem: true })).status).toBe(403)
  })

  it('marks a plate entered', async () => {
    const res = await call({ enteredInSystem: true })
    expect(res.status).toBe(200)
    expect(prisma.staffParkingPlate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enteredInSystem: true, enteredById: 'm1' }),
      }),
    )
  })

  it('clears the entered stamp', async () => {
    await call({ enteredInSystem: false })
    const data = prisma.staffParkingPlate.update.mock.calls[0][0].data
    expect(data.enteredInSystem).toBe(false)
    expect(data.enteredAt).toBeNull()
    expect(data.enteredById).toBeNull()
  })
})
