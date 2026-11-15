import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { verifyCredentialToken, resolveKioskAccess, submitFtpClaim, venueFindUnique } =
  vi.hoisted(() => ({
    verifyCredentialToken: vi.fn(),
    resolveKioskAccess: vi.fn(),
    submitFtpClaim: vi.fn(),
    venueFindUnique: vi.fn(),
  }))

vi.mock('@/lib/ftp-credentials.server', () => ({ verifyCredentialToken }))
vi.mock('@/lib/parking-kiosk-access.server', () => ({ resolveKioskAccess }))
vi.mock('@/lib/ftp-claims.server', () => ({ submitFtpClaim }))
vi.mock('@hospo-ops/db', () => ({
  prisma: { venue: { findUnique: venueFindUnique } },
}))

import { POST } from './route'

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/public/parking/kiosk/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const RESULT = {
  claimId: 'claim-1',
  status: 'CONFIRMED',
  ok: true,
  message: 'PARKING CONFIRMED',
  plate: 'ABC123',
  typeName: 'RAYC',
  memberName: 'TEST MEMBER',
  validFrom: '8:00 PM',
  validUntil: '12:00 AM',
  locations: ['The Landing Carpark'],
  fallbackUrl: null,
  manualToken: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyCredentialToken.mockResolvedValue({
    kind: 'MEMBER',
    venueId: 'v1',
    typeId: 't1',
    memberId: 'm1',
  })
  resolveKioskAccess.mockResolvedValue({ ok: true, venueId: 'v1', settings: {} })
  venueFindUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  submitFtpClaim.mockResolvedValue(RESULT)
})

describe('POST /api/public/parking/kiosk/claim', () => {
  it('rejects an expired token and a bad plate', async () => {
    verifyCredentialToken.mockResolvedValue(null)
    expect((await POST(req({ token: 'bad', plate: 'ABC123' }))).status).toBe(401)

    verifyCredentialToken.mockResolvedValue({
      kind: 'MEMBER',
      venueId: 'v1',
      typeId: 't1',
      memberId: 'm1',
    })
    expect((await POST(req({ token: 'ok', plate: 'TOO-LONG' }))).status).toBe(422)
  })

  it('submits the claim with the resolved venue and timezone', async () => {
    const res = await POST(req({ token: 'ok', plate: 'ab-123' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(RESULT)
    expect(submitFtpClaim).toHaveBeenCalledWith({
      venueId: 'v1',
      typeId: 't1',
      memberId: 'm1',
      credentialKind: 'MEMBER',
      plate: 'AB123',
      timezone: 'Pacific/Auckland',
    })
  })

  it('maps a claim with no id to 422', async () => {
    submitFtpClaim.mockResolvedValue({ ...RESULT, claimId: '', ok: false, message: 'NOPE' })
    const res = await POST(req({ token: 'ok', plate: 'ABC123' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'NOPE' })
  })

  it('re-checks kiosk access', async () => {
    resolveKioskAccess.mockResolvedValue({ ok: false, status: 401, error: 'KIOSK LOCKED' })
    const res = await POST(req({ token: 'ok', plate: 'ABC123' }))
    expect(res.status).toBe(401)
    expect(submitFtpClaim).not.toHaveBeenCalled()
  })
})
