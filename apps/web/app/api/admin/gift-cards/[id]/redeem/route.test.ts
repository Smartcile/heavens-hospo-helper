import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  redeemGiftCard: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess: mocks.guardAccess }))
vi.mock('@/lib/gift-card-redemption.server', () => ({ redeemGiftCard: mocks.redeemGiftCard }))

import { POST } from './route'

const req = (body: unknown) =>
  ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 'c1' } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServerSession.mockResolvedValue({
    user: { id: 's1', role: 'ADMIN', venueId: 'v1', name: 'BEA', email: 'bea@example.com' },
  })
  mocks.guardAccess.mockResolvedValue(null)
  mocks.redeemGiftCard.mockResolvedValue({ status: 200, body: { balance: 30 } })
})

describe('POST /api/admin/gift-cards/[id]/redeem', () => {
  it('returns 401 without a session', async () => {
    mocks.getServerSession.mockResolvedValue(null)
    const res = await POST(req({ amount: 20 }), params)
    expect(res.status).toBe(401)
    expect(mocks.redeemGiftCard).not.toHaveBeenCalled()
  })

  it('returns the guard response when the grant is missing', async () => {
    mocks.guardAccess.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    )
    const res = await POST(req({ amount: 20 }), params)
    expect(res.status).toBe(403)
    expect(mocks.redeemGiftCard).not.toHaveBeenCalled()
  })

  it('delegates to the shared helper with the venue and acting staff member', async () => {
    const res = await POST(req({ amount: 20 }), params)
    expect(res.status).toBe(200)
    expect(mocks.guardAccess).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 's1' }) }),
      expect.anything(),
      'performance.giftcards.redeem',
    )
    expect(mocks.redeemGiftCard).toHaveBeenCalledWith('v1', 'c1', 20, { actor: 'BEA' })
    expect(await res.json()).toEqual({ balance: 30 })
  })

  it('passes a conflict through', async () => {
    mocks.redeemGiftCard.mockResolvedValue({
      status: 409,
      body: { error: 'CARD #20260001 CHANGED WHILE REDEEMING — REFRESH AND TRY AGAIN' },
    })
    const res = await POST(req({ amount: 20 }), params)
    expect(res.status).toBe(409)
  })
})
