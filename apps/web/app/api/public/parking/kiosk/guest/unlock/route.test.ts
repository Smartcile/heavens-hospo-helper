import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  resolveGuestEntryType,
  verifyGuestEntryPin,
  createGuestEntryToken,
  guestSlotStateForType,
  guestEntryLinkView,
} = vi.hoisted(() => ({
  resolveGuestEntryType: vi.fn(),
  verifyGuestEntryPin: vi.fn(),
  createGuestEntryToken: vi.fn(),
  guestSlotStateForType: vi.fn(),
  guestEntryLinkView: vi.fn(),
}))

vi.mock('@/lib/ftp-guest-entry.server', () => ({
  resolveGuestEntryType,
  verifyGuestEntryPin,
  createGuestEntryToken,
  guestSlotStateForType,
  guestEntryLinkView,
}))

import { POST } from './route'

let ip = 0

function req(body: Record<string, unknown>) {
  ip += 1
  return new NextRequest('http://localhost/api/public/parking/kiosk/guest/unlock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.9.0.${ip}`,
    },
    body: JSON.stringify(body),
  })
}

const type = {
  id: 't1',
  venueId: 'v1',
  name: 'RAYC',
  guestEntryPinHash: 'hash',
  durationMinutes: 240,
  guestPlateLimitEnabled: false,
  guestPlateLimit: null,
}
const state = { used: 0, limit: null, remaining: null, full: false, nextFreeAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  resolveGuestEntryType.mockResolvedValue({ ok: true, type })
  verifyGuestEntryPin.mockResolvedValue(true)
  createGuestEntryToken.mockResolvedValue('guest-token')
  guestSlotStateForType.mockResolvedValue(state)
  guestEntryLinkView.mockReturnValue({ id: 't1', name: 'RAYC' })
})

describe('POST /api/public/parking/kiosk/guest/unlock', () => {
  it('rejects a short PIN', async () => {
    const res = await POST(req({ venueId: 'v1', typeId: 't1', pin: '12' }))
    expect(res.status).toBe(422)
  })

  it('rejects a wrong PIN', async () => {
    verifyGuestEntryPin.mockResolvedValue(false)
    const res = await POST(req({ venueId: 'v1', typeId: 't1', pin: '9999' }))
    expect(res.status).toBe(401)
  })

  it('returns a token and the link on success', async () => {
    const res = await POST(req({ venueId: 'v1', typeId: 't1', pin: '1234' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ token: 'guest-token', type: { id: 't1' } })
    expect(createGuestEntryToken).toHaveBeenCalledWith({ venueId: 'v1', typeId: 't1' })
  })
})
