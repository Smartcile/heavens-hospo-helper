import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  verifyCredentialToken,
  resolveKioskAccess,
  applyMemberPlateAction,
  typeFindFirst,
  memberFindFirst,
  compare,
} = vi.hoisted(() => ({
  verifyCredentialToken: vi.fn(),
  resolveKioskAccess: vi.fn(),
  applyMemberPlateAction: vi.fn(),
  typeFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  compare: vi.fn(),
}))

vi.mock('@/lib/ftp-credentials.server', () => ({ verifyCredentialToken }))
vi.mock('@/lib/parking-kiosk-access.server', () => ({ resolveKioskAccess }))
vi.mock('@/lib/ftp-member-plates.server', () => ({ applyMemberPlateAction }))
vi.mock('bcryptjs', () => ({ default: { compare }, compare }))
vi.mock('@hospo-ops/db', () => ({
  prisma: {
    ftpParkingType: { findFirst: typeFindFirst },
    member: { findFirst: memberFindFirst },
  },
}))

import { POST } from './route'

let requestIp = 0

function req(body: Record<string, unknown>) {
  requestIp += 1
  return new NextRequest('http://localhost/api/public/parking/kiosk/member/plates', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.2.0.${requestIp}`,
    },
    body: JSON.stringify(body),
  })
}

const TOKEN = { kind: 'MEMBER', venueId: 'v1', typeId: 't1', memberId: 'm1' }
const PLATES = [{ id: 'p2', plate: 'XYZ789', isDefault: true }]

beforeEach(() => {
  vi.clearAllMocks()
  verifyCredentialToken.mockResolvedValue(TOKEN)
  resolveKioskAccess.mockResolvedValue({ ok: true, venueId: 'v1', settings: {} })
  typeFindFirst.mockResolvedValue({
    id: 't1',
    plateRemovalRequiresPin: false,
    adminPinHash: null,
  })
  memberFindFirst.mockResolvedValue({ id: 'm1', savePlates: true })
  applyMemberPlateAction.mockResolvedValue({ ok: true, plates: PLATES })
  compare.mockResolvedValue(true)
})

describe('POST /api/public/parking/kiosk/member/plates', () => {
  it('rejects a bad or expired token', async () => {
    verifyCredentialToken.mockResolvedValue(null)
    const res = await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1' }))
    expect(res.status).toBe(401)
  })

  it('rejects a non-member admin token', async () => {
    verifyCredentialToken.mockResolvedValue({ ...TOKEN, kind: 'ADMIN_PIN', memberId: null })
    const res = await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1' }))
    expect(res.status).toBe(401)
  })

  it('refuses a locked kiosk', async () => {
    resolveKioskAccess.mockResolvedValue({ ok: false, status: 401, error: 'KIOSK LOCKED' })
    const res = await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1' }))
    expect(res.status).toBe(401)
  })

  it('validates the action and plate', async () => {
    expect((await POST(req({ token: 'x', action: 'NOPE', plateId: 'p1' }))).status).toBe(422)
    expect((await POST(req({ token: 'x', action: 'REMOVE' }))).status).toBe(422)
    expect(applyMemberPlateAction).not.toHaveBeenCalled()
  })

  it('removes a plate and returns the refreshed list', async () => {
    const res = await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, plates: PLATES })
    expect(applyMemberPlateAction).toHaveBeenCalledWith({
      venueId: 'v1',
      memberId: 'm1',
      plateId: 'p1',
      action: 'REMOVE',
    })
  })

  it('sets the default and returns the refreshed list', async () => {
    const res = await POST(req({ token: 'x', action: 'SET_DEFAULT', plateId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, plates: PLATES })
    expect(applyMemberPlateAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SET_DEFAULT', plateId: 'p1' }),
    )
  })

  it('returns 404 for a plate that belongs to another member', async () => {
    applyMemberPlateAction.mockResolvedValue({
      ok: false,
      reason: 'NOT_FOUND',
      plates: [],
    })
    const res = await POST(req({ token: 'x', action: 'REMOVE', plateId: 'other' }))
    expect(res.status).toBe(404)
  })

  it('requires the type admin PIN for removal when configured', async () => {
    typeFindFirst.mockResolvedValue({
      id: 't1',
      plateRemovalRequiresPin: true,
      adminPinHash: 'hash',
    })

    expect(
      (await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1' }))).status,
    ).toBe(403)
    expect(
      (await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1', adminPin: '12' })))
        .status,
    ).toBe(403)

    compare.mockResolvedValue(false)
    expect(
      (
        await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1', adminPin: '9999' }))
      ).status,
    ).toBe(403)

    compare.mockResolvedValue(true)
    const res = await POST(
      req({ token: 'x', action: 'REMOVE', plateId: 'p1', adminPin: '1234' }),
    )
    expect(res.status).toBe(200)
    expect(compare).toHaveBeenCalledWith('1234', 'hash')
  })

  it('rejects removal when a PIN is required but none is configured', async () => {
    typeFindFirst.mockResolvedValue({
      id: 't1',
      plateRemovalRequiresPin: true,
      adminPinHash: null,
    })
    const res = await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'PLATE REMOVAL IS NOT CONFIGURED — SPEAK WITH STAFF',
    })
    expect(compare).not.toHaveBeenCalled()
    expect(applyMemberPlateAction).not.toHaveBeenCalled()
  })

  it('does not need a PIN to set a default', async () => {
    typeFindFirst.mockResolvedValue({
      id: 't1',
      plateRemovalRequiresPin: true,
      adminPinHash: 'hash',
    })
    const res = await POST(req({ token: 'x', action: 'SET_DEFAULT', plateId: 'p1' }))
    expect(res.status).toBe(200)
    expect(compare).not.toHaveBeenCalled()
  })

  it('refuses plate management when the member has saving off', async () => {
    memberFindFirst.mockResolvedValue({ id: 'm1', savePlates: false })
    const res = await POST(req({ token: 'x', action: 'REMOVE', plateId: 'p1' }))
    expect(res.status).toBe(409)
    expect(applyMemberPlateAction).not.toHaveBeenCalled()
  })
})
