import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, registerParking, parkingHealthForVenue, prisma } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  registerParking: vi.fn(),
  parkingHealthForVenue: vi.fn(),
  prisma: {
    parkingConfig: { findUnique: vi.fn() },
    parkingRegistration: { findMany: vi.fn(), create: vi.fn() },
    venue: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/scan2pay.server', () => ({ registerParking }))
vi.mock('@/lib/parking-health.server', () => ({ parkingHealthForVenue }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET, POST } from './route'

const CONFIG = {
  id: 'c1',
  venueId: 'v1',
  enabled: true,
  carparkId: 19,
  carparkName: 'The Landing Carpark - Vehicle Parking',
  durationMinutes: 90,
  deletedAt: null,
}

function post(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/worker/parking', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const WINDOW = {
  entry: '2026-11-12T22:47:56',
  exit: '2026-11-13T00:17:56',
  startsAt: new Date('2026-11-12T09:47:56Z'),
  expiresAt: new Date('2026-11-12T11:17:56Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
  prisma.parkingConfig.findUnique.mockResolvedValue(CONFIG)
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  prisma.parkingRegistration.findMany.mockResolvedValue([])
  prisma.parkingRegistration.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'r1',
    ...data,
  }))
  registerParking.mockResolvedValue({
    status: 'CONFIRMED',
    ok: true,
    message: 'PARKING REGISTERED',
    licensePlate: 'QUZ69',
    window: WINDOW,
    confirmationRef: '12345',
    snippet: 'Success',
    httpStatus: 200,
  })
  parkingHealthForVenue.mockResolvedValue({ ok: true, stale: false, message: 'FORM READY' })
})

describe('GET /api/worker/parking', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('is silent when the venue has not enabled parking', async () => {
    prisma.parkingConfig.findUnique.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false })
    expect(prisma.parkingRegistration.findMany).not.toHaveBeenCalled()
  })

  it('returns only today’s registrations', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    prisma.parkingRegistration.findMany.mockResolvedValue([
      { id: 'today', createdAt: now, licensePlate: 'QUZ69' },
      { id: 'old', createdAt: old, licensePlate: 'ABC1' },
    ])

    const res = await GET()
    const body = await res.json()

    expect(body.enabled).toBe(true)
    expect(body.registrations.map((r: { id: string }) => r.id)).toEqual(['today'])
    expect(body.config.durationMinutes).toBe(90)
    expect(body.health).toEqual({ ok: true, stale: false, message: 'FORM READY' })
  })
})

describe('POST /api/worker/parking', () => {
  it('refuses when parking is disabled', async () => {
    prisma.parkingConfig.findUnique.mockResolvedValue({ ...CONFIG, enabled: false })
    const res = await POST(post({ licensePlate: 'QUZ69', arrivedAt: new Date().toISOString() }))
    expect(res.status).toBe(403)
    expect(registerParking).not.toHaveBeenCalled()
  })

  it('rejects an invalid plate', async () => {
    const res = await POST(post({ licensePlate: 'TOOLONG', arrivedAt: new Date().toISOString() }))
    expect(res.status).toBe(422)
    expect(registerParking).not.toHaveBeenCalled()
  })

  it('rejects an arrival whose free window has passed', async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const res = await POST(post({ licensePlate: 'QUZ69', arrivedAt: old }))
    expect(res.status).toBe(422)
    expect(registerParking).not.toHaveBeenCalled()
  })

  it('blocks a plate already registered today and returns the extend link', async () => {
    prisma.parkingRegistration.findMany.mockResolvedValue([
      { id: 'r0', createdAt: new Date(), status: 'CONFIRMED', licensePlate: 'QUZ69' },
    ])

    const res = await POST(post({ licensePlate: 'quz 69', arrivedAt: new Date().toISOString() }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.registration.id).toBe('r0')
    expect(body.extendUrl).toContain('/Parking/SelectTime?')
    expect(body.extendUrl).toContain('LicensePlate=QUZ69')
    expect(registerParking).not.toHaveBeenCalled()
  })

  it('registers the plate, persists the result and returns the extend link', async () => {
    const arrivedAt = new Date().toISOString()
    const res = await POST(post({ licensePlate: 'quz 69', arrivedAt }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(registerParking).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: 'QUZ69',
        arrivedAt: new Date(arrivedAt),
        timezone: 'Pacific/Auckland',
        target: expect.objectContaining({ carparkId: 19, durationMinutes: 90 }),
      }),
    )
    expect(prisma.parkingRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        staffId: 's1',
        licensePlate: 'QUZ69',
        status: 'CONFIRMED',
        confirmationRef: '12345',
      }),
    })
    expect(body.result.status).toBe('CONFIRMED')
    expect(body.registration.id).toBe('r1')
    expect(body.extendUrl).toContain('LicensePlate=QUZ69')
  })

  it('returns 502 when Scan2Pay does not confirm', async () => {
    registerParking.mockResolvedValue({
      status: 'FAILED',
      ok: false,
      message: 'SCAN2PAY RETURNED 503',
      licensePlate: 'QUZ69',
      window: WINDOW,
      snippet: '',
      httpStatus: 503,
    })

    const res = await POST(post({ licensePlate: 'QUZ69', arrivedAt: new Date().toISOString() }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('SCAN2PAY RETURNED 503')
  })
})
