import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  resolveKioskAccess,
  resolveFtpCredential,
  createCredentialToken,
  ftpCredentialPublicView,
} = vi.hoisted(() => ({
  resolveKioskAccess: vi.fn(),
  resolveFtpCredential: vi.fn(),
  createCredentialToken: vi.fn(),
  ftpCredentialPublicView: vi.fn(),
}))

vi.mock('@/lib/parking-kiosk-access.server', () => ({ resolveKioskAccess }))
vi.mock('@/lib/ftp-credentials.server', () => ({
  resolveFtpCredential,
  createCredentialToken,
  ftpCredentialPublicView,
}))

import { POST } from './route'

let requestIp = 0

function req(body: Record<string, unknown>) {
  requestIp += 1
  return new NextRequest('http://localhost/api/public/parking/kiosk/credential', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${requestIp}`,
    },
    body: JSON.stringify(body),
  })
}

const VIEW = {
  kind: 'MEMBER',
  type: { id: 't1', name: 'RAYC', windowLabel: null, durationMinutes: 240 },
  member: { id: 'm1', firstName: 'TEST', lastName: 'MEMBER', plates: [] },
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveKioskAccess.mockResolvedValue({ ok: true, venueId: 'v1', settings: {} })
  resolveFtpCredential.mockResolvedValue({
    ok: true,
    credential: { kind: 'MEMBER', type: { id: 't1' }, member: { id: 'm1' } },
  })
  createCredentialToken.mockResolvedValue('signed-token')
  ftpCredentialPublicView.mockReturnValue(VIEW)
})

describe('POST /api/public/parking/kiosk/credential', () => {
  it('refuses a locked kiosk', async () => {
    resolveKioskAccess.mockResolvedValue({ ok: false, status: 401, error: 'KIOSK LOCKED' })
    const res = await POST(req({ typeId: 't1', credential: '1234' }))
    expect(res.status).toBe(401)
  })

  it('validates the type and credential', async () => {
    expect((await POST(req({ credential: '1234' }))).status).toBe(422)
    expect((await POST(req({ typeId: 't1' }))).status).toBe(422)
    expect((await POST(req({ typeId: 't1', credential: 'ab' }))).status).toBe(401)
  })

  it('returns the public view and a short-lived token for a member', async () => {
    const res = await POST(req({ typeId: 't1', credential: '1234' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ...VIEW, token: 'signed-token' })
    expect(resolveFtpCredential).toHaveBeenCalledWith({
      venueId: 'v1',
      typeId: 't1',
      credential: '1234',
      mode: 'MEMBER',
    })
    expect(ftpCredentialPublicView).toHaveBeenCalled()
  })

  it('accepts a 2 digit membership number', async () => {
    const res = await POST(req({ typeId: 't1', credential: '12' }))
    expect(res.status).toBe(200)
    expect(resolveFtpCredential).toHaveBeenCalledWith({
      venueId: 'v1',
      typeId: 't1',
      credential: '12',
      mode: 'MEMBER',
    })
  })

  it('uses admin mode for the hidden admin PIN flow', async () => {
    resolveFtpCredential.mockResolvedValue({
      ok: true,
      credential: { kind: 'ADMIN_PIN', type: { id: 't1' }, member: null },
    })
    const res = await POST(req({ typeId: 't1', credential: '1234', mode: 'ADMIN' }))
    expect(res.status).toBe(200)
    expect(resolveFtpCredential).toHaveBeenCalledWith({
      venueId: 'v1',
      typeId: 't1',
      credential: '1234',
      mode: 'ADMIN',
    })
  })

  it('rejects a short admin PIN before resolving', async () => {
    const res = await POST(req({ typeId: 't1', credential: '12', mode: 'ADMIN' }))
    expect(res.status).toBe(401)
    expect(resolveFtpCredential).not.toHaveBeenCalled()
  })

  it('returns a generic not-recognised error', async () => {
    resolveFtpCredential.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' })
    const res = await POST(req({ typeId: 't1', credential: '9999' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'NOT RECOGNISED — SPEAK WITH STAFF' })
  })

  it('reports an unavailable type', async () => {
    resolveFtpCredential.mockResolvedValue({ ok: false, reason: 'TYPE_UNAVAILABLE' })
    const res = await POST(req({ typeId: 't1', credential: '1234' }))
    expect(res.status).toBe(409)
  })
})
