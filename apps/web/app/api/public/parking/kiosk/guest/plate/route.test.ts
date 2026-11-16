import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { verifyGuestEntryToken, submitGuestEntryPlate, venueFindUnique } = vi.hoisted(() => ({
  verifyGuestEntryToken: vi.fn(),
  submitGuestEntryPlate: vi.fn(),
  venueFindUnique: vi.fn(),
}))

vi.mock('@/lib/ftp-guest-entry.server', () => ({
  verifyGuestEntryToken,
  submitGuestEntryPlate,
}))
vi.mock('@hospo-ops/db', () => ({
  prisma: { venue: { findUnique: venueFindUnique } },
}))

import { POST } from './route'

let ip = 0

function req(body: Record<string, unknown>) {
  ip += 1
  return new NextRequest('http://localhost/api/public/parking/kiosk/guest/plate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.8.0.${ip}`,
    },
    body: JSON.stringify(body),
  })
}

const slots = { used: 1, limit: 5, remaining: 4, full: false, nextFreeAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  verifyGuestEntryToken.mockResolvedValue({ venueId: 'v1', typeId: 't1' })
  venueFindUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
})

describe('POST /api/public/parking/kiosk/guest/plate', () => {
  it('rejects an expired token', async () => {
    verifyGuestEntryToken.mockResolvedValue(null)
    const res = await POST(req({ token: 'bad', plate: 'ABC123' }))
    expect(res.status).toBe(401)
  })

  it('reports a full link', async () => {
    submitGuestEntryPlate.mockResolvedValue({
      ok: false,
      full: true,
      error: 'NO PARKING SLOTS ARE AVAILABLE FOR THIS LINK',
      slots: { ...slots, used: 5, remaining: 0, full: true },
    })
    const res = await POST(req({ token: 'good', plate: 'ABC123' }))
    expect(res.status).toBe(409)
    expect((await res.json()).full).toBe(true)
  })

  it('submits a plate and returns the remaining slots', async () => {
    submitGuestEntryPlate.mockResolvedValue({
      ok: true,
      claim: {
        claimId: 'claim-1',
        status: 'CONFIRMED',
        ok: true,
        message: 'PARKING CONFIRMED',
        plate: 'ABC123',
        typeName: 'RAYC',
        validFrom: '8:00 PM',
        validUntil: '12:00 AM',
        locations: ['Carpark'],
        fallbackUrl: null,
        manualToken: null,
      },
      slots,
    })
    const res = await POST(req({ token: 'good', plate: 'ABC123' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({
      status: 'CONFIRMED',
      plate: 'ABC123',
      slots: { used: 1, remaining: 4 },
    })
    expect(submitGuestEntryPlate).toHaveBeenCalledWith({
      venueId: 'v1',
      typeId: 't1',
      plate: 'ABC123',
      timezone: 'Pacific/Auckland',
    })
  })
})
