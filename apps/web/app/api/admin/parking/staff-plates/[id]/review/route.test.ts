import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, prisma, tx } = vi.hoisted(() => {
  const tx = {
    staffParkingPlate: { updateMany: vi.fn(), create: vi.fn() },
    staffParkingPlateRequest: { update: vi.fn() },
  }
  const prisma = {
    staffParkingPlateRequest: { findUnique: vi.fn(), update: vi.fn() },
    staffParkingPlate: { findMany: vi.fn() },
    $transaction: vi.fn(),
  }
  return { getServerSession: vi.fn(), prisma, tx }
})

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { POST } from './route'

const MANAGER = { user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } }

const REQUEST = {
  id: 'r1',
  venueId: 'v1',
  staffId: 's1',
  plate: 'NEW99',
  previousPlate: 'OLD1',
  status: 'PENDING',
  deletedAt: null,
}

function call(body: Record<string, unknown>) {
  const req = new NextRequest('http://localhost/api/admin/parking/staff-plates/r1/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req, { params: { id: 'r1' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(MANAGER)
  prisma.staffParkingPlateRequest.findUnique.mockResolvedValue(REQUEST)
  prisma.staffParkingPlate.findMany.mockResolvedValue([
    { id: 'p1', plate: 'OLD1', status: 'ACTIVE' },
  ])
  prisma.$transaction.mockImplementation(async (callback: (inner: typeof tx) => unknown) =>
    callback(tx),
  )
  tx.staffParkingPlate.updateMany.mockResolvedValue({ count: 1 })
  tx.staffParkingPlate.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p-new', ...data }),
  )
  tx.staffParkingPlateRequest.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ ...REQUEST, ...data }),
  )
})

describe('POST /api/admin/parking/staff-plates/[id]/review', () => {
  it('404s an unknown request', async () => {
    prisma.staffParkingPlateRequest.findUnique.mockResolvedValue(null)
    expect((await call({ action: 'APPROVE' })).status).toBe(404)
  })

  it('blocks another venue', async () => {
    prisma.staffParkingPlateRequest.findUnique.mockResolvedValue({ ...REQUEST, venueId: 'v2' })
    expect((await call({ action: 'APPROVE' })).status).toBe(403)
  })

  it('rejects an invalid action', async () => {
    expect((await call({ action: 'DELETE' })).status).toBe(422)
  })

  it('refuses to review twice', async () => {
    prisma.staffParkingPlateRequest.findUnique.mockResolvedValue({
      ...REQUEST,
      status: 'APPROVED',
    })
    expect((await call({ action: 'APPROVE' })).status).toBe(409)
  })

  it('rejects with a note', async () => {
    prisma.staffParkingPlateRequest.update.mockResolvedValue({ ...REQUEST, status: 'REJECTED' })
    const res = await call({ action: 'REJECT', note: 'not their car' })
    expect(res.status).toBe(200)
    expect(prisma.staffParkingPlateRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', reviewNote: 'not their car' }),
      }),
    )
  })

  it('approves by retiring the replaced plate and creating the new one', async () => {
    const res = await call({ action: 'APPROVE', note: 'ok' })
    expect(res.status).toBe(200)

    expect(tx.staffParkingPlate.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1'] } },
      data: { status: 'RETIRED' },
    })
    expect(tx.staffParkingPlate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        staffId: 's1',
        plate: 'NEW99',
        status: 'ACTIVE',
        enteredInSystem: false,
      }),
    })
    expect(tx.staffParkingPlateRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', reviewNote: 'ok' }),
      }),
    )
  })
})
