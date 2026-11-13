import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    ftpSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    parkingConfig: { findUnique: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET, PUT } from './route'

const ADMIN = { user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1', 'v2'] } }
const MANAGER = { user: { id: 'u2', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } }

function get(query = '') {
  return new NextRequest(`http://localhost/api/admin/parking/ftp${query}`)
}

function put(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/parking/ftp', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(ADMIN)
  prisma.ftpSettings.findUnique.mockResolvedValue(null)
  prisma.parkingConfig.findUnique.mockResolvedValue(null)
  prisma.ftpSettings.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    id: 'f1',
    ...create,
  }))
})

describe('GET /api/admin/parking/ftp', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(get())).status).toBe(401)
  })

  it('returns defaults and the kiosk URL', async () => {
    const body = await (await GET(get())).json()
    expect(body.settings).toMatchObject({
      kioskEnabled: false,
      kioskAutoResetSeconds: 60,
      fourHourName: '4 HOUR CAR PARK',
      staffParkingEnabled: false,
    })
    expect(body.kioskUrl).toContain('/park')
  })

  it('reads an existing row', async () => {
    prisma.ftpSettings.findUnique.mockResolvedValue({
      id: 'f1',
      venueId: 'v1',
      contactEmail: 'carpark@venue.nz',
      kioskEnabled: true,
      kioskCodeHint: '12',
      deletedAt: null,
    })
    const body = await (await GET(get())).json()
    expect(body.settings.contactEmail).toBe('carpark@venue.nz')
    expect(body.settings.kioskCodeHint).toBe('12')
  })

  it('locks a manager to their own venue', async () => {
    getServerSession.mockResolvedValue(MANAGER)
    await GET(get('?venueId=v2'))
    expect(prisma.ftpSettings.findUnique).toHaveBeenCalledWith({ where: { venueId: 'v1' } })
  })
})

describe('PUT /api/admin/parking/ftp', () => {
  it('rejects an invalid email', async () => {
    const res = await PUT(put({ contactEmail: 'nope' }))
    expect(res.status).toBe(422)
  })

  it('rejects enabling the 4 hour carpark without a URL', async () => {
    const res = await PUT(put({ fourHourEnabled: true }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('4 HOUR CARPARK URL')
  })

  it('refuses the kiosk until 90 minute parking is enabled', async () => {
    prisma.parkingConfig.findUnique.mockResolvedValue({ enabled: false, carparkId: 19, deletedAt: null })
    const res = await PUT(put({ kioskEnabled: true }))
    expect(res.status).toBe(422)
  })

  it('saves a valid FTP payload', async () => {
    prisma.parkingConfig.findUnique.mockResolvedValue({ enabled: true, carparkId: 19, deletedAt: null })
    const res = await PUT(
      put({
        kioskEnabled: true,
        kioskAutoResetSeconds: 45,
        contactEmail: 'carpark@venue.nz',
        fourHourName: 'long stay',
        fourHourEnabled: true,
        fourHourEntryUrl: 'https://carpark.example.com/4h',
        staffParkingEnabled: true,
      }),
    )
    expect(res.status).toBe(200)
    expect(prisma.ftpSettings.upsert).toHaveBeenCalled()
    const args = prisma.ftpSettings.upsert.mock.calls[0][0]
    expect(args.create).toMatchObject({
      venueId: 'v1',
      kioskEnabled: true,
      kioskAutoResetSeconds: 45,
      fourHourName: 'LONG STAY',
      staffParkingEnabled: true,
    })
  })

  it('locks a manager to their own venue on save', async () => {
    getServerSession.mockResolvedValue(MANAGER)
    await PUT(put({ venueId: 'v2' }))
    const args = prisma.ftpSettings.upsert.mock.calls[0][0]
    expect(args.where).toEqual({ venueId: 'v1' })
  })
})
