import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    staffParkingPlateRequest: { findMany: vi.fn() },
    staffParkingPlate: { findMany: vi.fn() },
    venue: { findUnique: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET } from './route'

const MANAGER = { user: { id: 'u2', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } }

function get(query = '') {
  return new NextRequest(`http://localhost/api/admin/parking/staff-plates${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(MANAGER)
  prisma.staffParkingPlateRequest.findMany.mockResolvedValue([
    { id: 'r1', status: 'PENDING', plate: 'ABC123' },
    { id: 'r2', status: 'APPROVED', plate: 'OLD1' },
  ])
  prisma.staffParkingPlate.findMany.mockResolvedValue([
    { id: 'p1', status: 'ACTIVE', plate: 'OLD1', enteredInSystem: false },
    { id: 'p2', status: 'ACTIVE', plate: 'ABC123', enteredInSystem: true },
    { id: 'p3', status: 'RETIRED', plate: 'GONE1', enteredInSystem: true },
  ])
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
})

describe('GET /api/admin/parking/staff-plates', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(get())).status).toBe(401)
  })

  it('returns requests, plates and counts for the manager venue', async () => {
    const body = await (await GET(get('?venueId=v9'))).json()
    expect(prisma.staffParkingPlateRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { venueId: 'v1', deletedAt: null } }),
    )
    expect(body.counts).toEqual({ pending: 1, toEnter: 1, active: 2 })
    expect(body.timezone).toBe('Pacific/Auckland')
  })
})
