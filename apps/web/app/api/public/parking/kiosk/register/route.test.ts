import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getKioskSession, registerParking, prisma } = vi.hoisted(() => ({
  getKioskSession: vi.fn(),
  registerParking: vi.fn(),
  prisma: {
    ftpSettings: { findUnique: vi.fn() },
    parkingConfig: { findUnique: vi.fn() },
    venue: { findUnique: vi.fn() },
    parkingRegistration: { create: vi.fn() },
  },
}))

vi.mock('@/lib/parking-kiosk.server', () => ({ getKioskSession }))
vi.mock('@/lib/scan2pay.server', () => ({ registerParking }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') },
}))

import { POST } from './route'

const SETTINGS = {
  venueId: 'v1',
  kioskEnabled: true,
  kioskRequireCode: false,
  kioskCodeHash: 'hash',
  contactEmail: 'carpark@venue.nz',
  deletedAt: null,
}

const CONFIG = {
  venueId: 'v1',
  enabled: true,
  carparkId: 19,
  carparkName: 'The Landing',
  durationMinutes: 90,
  deletedAt: null,
}

const WINDOW = {
  entry: '2026-11-12T22:47:56',
  exit: '2026-11-13T00:17:56',
  startsAt: new Date('2026-11-12T09:47:56Z'),
  expiresAt: new Date('2026-11-12T11:17:56Z'),
}

let ipCounter = 0

function req(body: Record<string, unknown>) {
  ipCounter += 1
  return new NextRequest('http://localhost/api/public/parking/kiosk/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.2.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getKioskSession.mockResolvedValue({ venueId: 'v1', codeHash: 'hash' })
  prisma.ftpSettings.findUnique.mockResolvedValue(SETTINGS)
  prisma.parkingConfig.findUnique.mockResolvedValue(CONFIG)
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
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
})

describe('POST /api/public/parking/kiosk/register', () => {
  it('needs a venue when there is no session', async () => {
    getKioskSession.mockResolvedValue(null)
    const res = await POST(req({ licensePlate: 'QUZ69' }))
    expect(res.status).toBe(401)
  })

  it('registers without a session when the kiosk code is off', async () => {
    getKioskSession.mockResolvedValue(null)
    const res = await POST(req({ licensePlate: 'QUZ69', venueId: 'v1' }))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('CONFIRMED')
  })

  it('refuses an open request for a code-required kiosk', async () => {
    getKioskSession.mockResolvedValue(null)
    prisma.ftpSettings.findUnique.mockResolvedValue({
      ...SETTINGS,
      kioskRequireCode: true,
    })
    const res = await POST(req({ licensePlate: 'QUZ69', venueId: 'v1' }))
    expect(res.status).toBe(401)
  })

  it('locks out a rotated code when the code is required', async () => {
    prisma.ftpSettings.findUnique.mockResolvedValue({
      ...SETTINGS,
      kioskRequireCode: true,
      kioskCodeHash: 'old',
    })
    const res = await POST(req({ licensePlate: 'QUZ69' }))
    expect(res.status).toBe(401)
  })

  it('validates the plate', async () => {
    const res = await POST(req({ licensePlate: 'TOOLONG' }))
    expect(res.status).toBe(422)
    expect(registerParking).not.toHaveBeenCalled()
  })

  it('registers and returns the end time + QR without storing the plate', async () => {
    const res = await POST(req({ licensePlate: 'quz 69' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('CONFIRMED')
    expect(body.plate).toBe('QUZ69')
    expect(body.endTime).toBe('00:17')
    expect(body.qrDataUrl).toBe('data:image/png;base64,QR')
    expect(registerParking).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: 'QUZ69',
        customerEmail: 'carpark@venue.nz',
      }),
    )
    expect(prisma.parkingRegistration.create).not.toHaveBeenCalled()
  })

  it('returns ALREADY_ACTIVE for an existing session', async () => {
    registerParking.mockResolvedValue({
      status: 'ALREADY_ACTIVE',
      ok: true,
      message: 'THIS PLATE ALREADY HAS A SESSION TODAY',
      licensePlate: 'QUZ69',
      window: WINDOW,
      snippet: '',
      httpStatus: 200,
      existing: { active: true, expiry: '2026-11-12T23:00:00' },
    })
    const body = await (await POST(req({ licensePlate: 'QUZ69' }))).json()
    expect(body.status).toBe('ALREADY_ACTIVE')
    expect(body.alreadyActive).toBe(true)
    expect(body.existingExpiry).toBe('2026-11-12T23:00:00')
  })

  it('reports an upstream failure as a 200 result for the kiosk UI', async () => {
    registerParking.mockResolvedValue({
      status: 'FAILED',
      ok: false,
      message: 'COULD NOT REACH SCAN2PAY',
      licensePlate: 'QUZ69',
      window: WINDOW,
      snippet: '',
      httpStatus: 0,
    })
    const res = await POST(req({ licensePlate: 'QUZ69' }))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('FAILED')
  })
})
