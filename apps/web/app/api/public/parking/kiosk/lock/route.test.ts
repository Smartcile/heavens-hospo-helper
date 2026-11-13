import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getKioskSession, clearKioskCookie, hashKioskCode } = vi.hoisted(() => ({
  getKioskSession: vi.fn(),
  clearKioskCookie: vi.fn(),
  hashKioskCode: vi.fn((code: string) => `hash:${code}`),
}))

vi.mock('@/lib/parking-kiosk.server', () => ({
  getKioskSession,
  clearKioskCookie,
  hashKioskCode,
}))

import { POST } from './route'

let ipCounter = 0

function req(body: Record<string, unknown>) {
  ipCounter += 1
  return new NextRequest('http://localhost/api/public/parking/kiosk/lock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.1.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getKioskSession.mockResolvedValue({ venueId: 'v1', codeHash: 'hash:ABC123' })
})

describe('POST /api/public/parking/kiosk/lock', () => {
  it('is a no-op when already locked', async () => {
    getKioskSession.mockResolvedValue(null)
    const res = await POST(req({ code: 'ABC123' }))
    expect(res.status).toBe(200)
    expect(clearKioskCookie).toHaveBeenCalled()
  })

  it('refuses a wrong code without clearing the cookie', async () => {
    const res = await POST(req({ code: 'NOPE99' }))
    expect(res.status).toBe(401)
    expect(clearKioskCookie).not.toHaveBeenCalled()
  })

  it('clears the cookie with the right code', async () => {
    const res = await POST(req({ code: 'abc123' }))
    expect(res.status).toBe(200)
    expect(clearKioskCookie).toHaveBeenCalled()
  })
})
