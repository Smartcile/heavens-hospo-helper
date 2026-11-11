import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerMayIssueGiftCards: vi.fn(),
  redeemGiftCard: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession: mocks.getWorkerSession }))
vi.mock('@/lib/worker-gift-access', () => ({ workerMayIssueGiftCards: mocks.workerMayIssueGiftCards }))
vi.mock('@/lib/gift-card-redemption.server', () => ({ redeemGiftCard: mocks.redeemGiftCard }))

import { POST } from './route'

const req = (body: unknown) =>
  ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 'c1' } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1', role: 'STAFF' })
  mocks.workerMayIssueGiftCards.mockResolvedValue(true)
})

describe('POST /api/worker/giftcards/[id]/redeem', () => {
  it('refuses without gift-card access', async () => {
    mocks.workerMayIssueGiftCards.mockResolvedValue(false)
    const res = await POST(req({ amount: 10 }), params)
    expect(res.status).toBe(403)
    expect(mocks.redeemGiftCard).not.toHaveBeenCalled()
  })

  it('delegates to the venue-scoped redemption helper', async () => {
    mocks.redeemGiftCard.mockResolvedValue({ status: 200, body: { balance: 40 } })
    const res = await POST(req({ amount: 10 }), params)
    expect(res.status).toBe(200)
    expect(mocks.redeemGiftCard).toHaveBeenCalledWith('v1', 'c1', 10)
    expect(await res.json()).toEqual({ balance: 40 })
  })

  it('passes validation failures straight through', async () => {
    mocks.redeemGiftCard.mockResolvedValue({ status: 409, body: { error: 'ONLY $5.00 REMAINS ON CARD #20260001' } })
    const res = await POST(req({ amount: 10 }), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'ONLY $5.00 REMAINS ON CARD #20260001' })
  })
})
