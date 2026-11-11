import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prisma: {
    giftCard: {
      findFirst: vi.fn(),
    },
  },
  getWorkerSession: vi.fn(),
  workerMayIssueGiftCards: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession: mocks.getWorkerSession }))
vi.mock('@/lib/worker-gift-access', () => ({
  workerMayIssueGiftCards: mocks.workerMayIssueGiftCards,
}))

import { GET } from './route'

const params = { params: { id: 'c1' } }
const req = {} as NextRequest

const card = {
  id: 'c1',
  number: '20260003',
  amount: 50,
  redeemedAmount: 10,
  status: 'ISSUED',
  customerName: 'LIAM HEAVEN',
  customerEmail: 'buyer@example.com',
  message: 'Enjoy!',
  issuedAt: '2026-11-01T00:00:00.000Z',
  sentAt: null,
  expiresAt: null,
  redeemedAt: null,
  pdfPath: '/uploads/gift-cards/card.pdf',
  createdAt: '2026-11-01T00:00:00.000Z',
  history: [{ at: '2026-11-01T00:00:00.000Z', type: 'ISSUED', note: 'PDF GENERATED' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1', role: 'STAFF' })
  mocks.workerMayIssueGiftCards.mockResolvedValue(true)
  mocks.prisma.giftCard.findFirst.mockResolvedValue(card)
})

describe('GET /api/worker/giftcards/[id]', () => {
  it('refuses without gift-card access', async () => {
    mocks.workerMayIssueGiftCards.mockResolvedValue(false)
    const res = await GET(req, params)
    expect(res.status).toBe(403)
    expect(mocks.prisma.giftCard.findFirst).not.toHaveBeenCalled()
  })

  it('is venue-scoped and never selects admin-private notes', async () => {
    const res = await GET(req, params)
    const body = await res.json()

    expect(res.status).toBe(200)
    const call = mocks.prisma.giftCard.findFirst.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'c1', venueId: 'v1', deletedAt: null })
    expect(call.select.history).toBe(true)
    expect(call.select.number).toBe(true)
    expect(call.select.notes).toBeUndefined()
    expect(call.select.wooOrderId).toBeUndefined()
    expect(call.select.replacesId).toBeUndefined()
    expect(body.card.notes).toBeUndefined()
    expect(body.balance).toBe(40)
  })

  it('returns 404 for a card outside the session venue', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(null)
    const res = await GET(req, { params: { id: 'other' } })
    expect(res.status).toBe(404)
  })
})
