import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { verifyManualToken, resolveKioskAccess, setFtpManualOutcome } = vi.hoisted(() => ({
  verifyManualToken: vi.fn(),
  resolveKioskAccess: vi.fn(),
  setFtpManualOutcome: vi.fn(),
}))

vi.mock('@/lib/ftp-credentials.server', () => ({ verifyManualToken }))
vi.mock('@/lib/parking-kiosk-access.server', () => ({ resolveKioskAccess }))
vi.mock('@/lib/ftp-claims.server', () => ({ setFtpManualOutcome }))

import { POST } from './route'

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/public/parking/kiosk/claim/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyManualToken.mockResolvedValue({ venueId: 'v1', claimId: 'c1' })
  resolveKioskAccess.mockResolvedValue({ ok: true, venueId: 'v1', settings: {} })
  setFtpManualOutcome.mockResolvedValue({ ok: true, status: 'MANUAL_CONFIRMED' })
})

describe('POST /api/public/parking/kiosk/claim/manual', () => {
  it('rejects a bad outcome and an expired token', async () => {
    expect((await POST(req({ token: 'ok', outcome: 'NOPE' }))).status).toBe(400)
    verifyManualToken.mockResolvedValue(null)
    expect((await POST(req({ token: 'bad', outcome: 'OPENED' }))).status).toBe(401)
  })

  it('records the outcome', async () => {
    const res = await POST(req({ token: 'ok', outcome: 'CONFIRMED' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, status: 'MANUAL_CONFIRMED' })
    expect(setFtpManualOutcome).toHaveBeenCalledWith({
      venueId: 'v1',
      claimId: 'c1',
      outcome: 'CONFIRMED',
    })
  })

  it('surfaces a closed claim', async () => {
    setFtpManualOutcome.mockResolvedValue({ ok: false, message: 'ALREADY CONFIRMED' })
    const res = await POST(req({ token: 'ok', outcome: 'CONFIRMED' }))
    expect(res.status).toBe(409)
  })
})
