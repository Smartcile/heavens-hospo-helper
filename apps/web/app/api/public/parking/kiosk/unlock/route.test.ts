import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, createKioskSession, setKioskCookie, hashKioskCode } = vi.hoisted(() => ({
  prisma: {
    ftpSettings: { findFirst: vi.fn() },
    parkingConfig: { findUnique: vi.fn() },
  },
  createKioskSession: vi.fn(),
  setKioskCookie: vi.fn(),
  hashKioskCode: vi.fn((code: string) => `hash:${code}`),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/parking-kiosk.server', () => ({
  createKioskSession,
  setKioskCookie,
  hashKioskCode,
}))

import { POST } from './route'

let ipCounter = 0

function req(body: Record<string, unknown>) {
  ipCounter += 1
  return new NextRequest('http://localhost/api/public/parking/kiosk/unlock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.ftpSettings.findFirst.mockResolvedValue({
    venueId: 'v1',
    kioskCodeHash: 'hash:ABC123',
  })
  prisma.parkingConfig.findUnique.mockResolvedValue({ enabled: true, deletedAt: null })
  createKioskSession.mockResolvedValue('token')
})

describe('POST /api/public/parking/kiosk/unlock', () => {
  it('rejects a short code', async () => {
    const res = await POST(req({ code: 'ABC' }))
    expect(res.status).toBe(422)
  })

  it('rejects a wrong code', async () => {
    prisma.ftpSettings.findFirst.mockResolvedValue(null)
    const res = await POST(req({ code: 'WRONG9' }))
    expect(res.status).toBe(401)
    expect(setKioskCookie).not.toHaveBeenCalled()
  })

  it('refuses when guest parking is not enabled', async () => {
    prisma.parkingConfig.findUnique.mockResolvedValue(null)
    const res = await POST(req({ code: 'ABC123' }))
    expect(res.status).toBe(400)
  })

  it('sets the kiosk cookie on success', async () => {
    const res = await POST(req({ code: 'abc-123' }))
    expect(res.status).toBe(200)
    expect(createKioskSession).toHaveBeenCalledWith({
      venueId: 'v1',
      codeHash: 'hash:ABC123',
    })
    expect(setKioskCookie).toHaveBeenCalledWith('token')
  })
})
