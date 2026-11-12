import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, fetchCarparkName, parkingHealthForVenue, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  fetchCarparkName: vi.fn(),
  parkingHealthForVenue: vi.fn(),
  prisma: {
    parkingConfig: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/scan2pay.server', () => ({ fetchCarparkName }))
vi.mock('@/lib/parking-health.server', () => ({ parkingHealthForVenue }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET, PUT } from './route'

const ADMIN = {
  user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1', 'v2'] },
}

function get(query = '') {
  return new NextRequest(`http://localhost/api/admin/parking/config${query}`)
}

function put(body: Record<string, unknown>, cookie?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  return new NextRequest('http://localhost/api/admin/parking/config', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
}

const HEALTH = { ok: false, stale: true, message: 'NO CHECK HAS RUN YET' }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(ADMIN)
  fetchCarparkName.mockResolvedValue('The Landing Carpark - Vehicle Parking')
  parkingHealthForVenue.mockResolvedValue(HEALTH)
  prisma.parkingConfig.findUnique.mockResolvedValue(null)
  prisma.parkingConfig.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c1',
    ...data,
  }))
  prisma.parkingConfig.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c1',
    ...data,
  }))
})

describe('GET /api/admin/parking/config', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(get())).status).toBe(401)
  })

  it('returns disabled defaults when nothing is configured', async () => {
    const body = await (await GET(get())).json()
    expect(body.config).toMatchObject({
      venueId: 'v1',
      enabled: false,
      durationMinutes: 90,
      healthCheckMode: 'READINESS',
      healthPlate: 'STELLA',
    })
    expect(body.health).toEqual(HEALTH)
  })

  it('returns an existing config', async () => {
    prisma.parkingConfig.findUnique.mockResolvedValue({
      id: 'c1',
      venueId: 'v1',
      enabled: true,
      entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
      carparkId: 19,
      carparkName: 'The Landing',
      durationMinutes: 90,
      healthCheckMode: 'READINESS',
      healthPlate: 'STELLA',
      deletedAt: null,
    })
    const body = await (await GET(get())).json()
    expect(body.config.carparkId).toBe(19)
  })

  it('lets an admin read a requested venue', async () => {
    await GET(get('?venueId=v2'))
    expect(prisma.parkingConfig.findUnique).toHaveBeenCalledWith({ where: { venueId: 'v2' } })
  })
})

describe('PUT /api/admin/parking/config', () => {
  it('refuses a non-Scan2Pay URL', async () => {
    const res = await PUT(
      put({ enabled: true, entryUrl: 'https://example.com/Parking/Scan?carparkId=19' }),
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('ONLY SCAN2PAY.NZ')
  })

  it('refuses to enable without a URL', async () => {
    const res = await PUT(put({ enabled: true, entryUrl: '' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('PASTE THE CARPARK URL BEFORE ENABLING')
  })

  it('saves the parsed carpark id and fetched name', async () => {
    const res = await PUT(
      put({
        enabled: true,
        entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
        durationMinutes: 90,
        healthCheckMode: 'READINESS',
        healthPlate: 'stella',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(fetchCarparkName).toHaveBeenCalledWith({
      baseUrl: 'https://scan2pay.nz',
      carparkId: 19,
    })
    expect(prisma.parkingConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        enabled: true,
        entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
        carparkId: 19,
        carparkName: 'The Landing Carpark - Vehicle Parking',
        healthPlate: 'STELLA',
        deletedAt: null,
      }),
    })
    expect(body.config.carparkId).toBe(19)
  })

  it('updates an existing config and revives a soft-deleted one', async () => {
    prisma.parkingConfig.findUnique.mockResolvedValue({ id: 'c1', deletedAt: new Date() })
    await PUT(
      put({
        enabled: false,
        entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
      }),
    )
    expect(prisma.parkingConfig.update).toHaveBeenCalledWith({
      where: { venueId: 'v1' },
      data: expect.objectContaining({ enabled: false, deletedAt: null }),
    })
  })

  it('clamps the duration and rejects an invalid health plate', async () => {
    await PUT(
      put({
        enabled: false,
        entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
        durationMinutes: 99999,
      }),
    )
    expect(prisma.parkingConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ durationMinutes: 1440 }),
    })

    const res = await PUT(
      put({
        enabled: false,
        entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
        healthPlate: 'TOOLONG',
      }),
    )
    expect(res.status).toBe(422)
  })

  it('keeps a manager on their effective venue', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })

    await PUT(
      put(
        {
          venueId: 'v2',
          enabled: false,
          entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
        },
        'admin-active-venue=v1',
      ),
    )

    expect(prisma.parkingConfig.findUnique).toHaveBeenCalledWith({
      where: { venueId: 'v1' },
      select: { id: true },
    })
  })
})
