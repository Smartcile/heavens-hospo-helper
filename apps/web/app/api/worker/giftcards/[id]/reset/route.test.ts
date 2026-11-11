import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerMayManageGiftCards: vi.fn(),
  resetGiftCardToDraft: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession: mocks.getWorkerSession }))
vi.mock('@/lib/worker-gift-access', () => ({ workerMayManageGiftCards: mocks.workerMayManageGiftCards }))
vi.mock('@/lib/gift-cards', () => ({ resetGiftCardToDraft: mocks.resetGiftCardToDraft }))

import { POST } from './route'

const params = { params: { id: 'c1' } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1', role: 'STAFF' })
  mocks.workerMayManageGiftCards.mockResolvedValue(false)
})

describe('POST /api/worker/giftcards/[id]/reset', () => {
  it('refuses a session without the manage grant before touching the card', async () => {
    const res = await POST({} as NextRequest, params)
    expect(res.status).toBe(403)
    expect(mocks.resetGiftCardToDraft).not.toHaveBeenCalled()
  })

  it('reuses the card with the same number and keeps history', async () => {
    mocks.workerMayManageGiftCards.mockResolvedValue(true)
    mocks.resetGiftCardToDraft.mockResolvedValue({
      ok: true,
      card: { id: 'c1', number: '20260001', status: 'DRAFT', amount: 0, history: [{ type: 'RESET' }] },
    })

    const res = await POST({} as NextRequest, params)
    expect(res.status).toBe(200)
    expect(mocks.workerMayManageGiftCards).toHaveBeenCalled()
    expect(mocks.resetGiftCardToDraft).toHaveBeenCalledWith('v1', 'c1')
    expect(await res.json()).toMatchObject({ number: '20260001', status: 'DRAFT' })
  })

  it('passes helper failures through', async () => {
    mocks.workerMayManageGiftCards.mockResolvedValue(true)
    mocks.resetGiftCardToDraft.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'CARD #20260001 IS ITSELF A REPLACEMENT — ITS NUMBER IS RETIRED AND CANNOT BE RESET',
    })
    const res = await POST({} as NextRequest, params)
    expect(res.status).toBe(400)
  })
})
