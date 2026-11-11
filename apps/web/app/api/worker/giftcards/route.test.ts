import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prisma: {
    giftCard: {
      findMany: vi.fn(),
    },
  },
  getWorkerSession: vi.fn(),
  workerMayIssueGiftCards: vi.fn(),
  workerMayManageGiftCards: vi.fn(),
  issuePremade: vi.fn(),
  issueSpecificPremade: vi.fn(),
  nextPremadeNumber: vi.fn(),
  logGiftCardEvent: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession: mocks.getWorkerSession }))
vi.mock('@/lib/worker-gift-access', () => ({
  workerMayIssueGiftCards: mocks.workerMayIssueGiftCards,
  workerMayManageGiftCards: mocks.workerMayManageGiftCards,
}))
vi.mock('@/lib/gift-cards', () => ({
  issuePremade: mocks.issuePremade,
  issueSpecificPremade: mocks.issueSpecificPremade,
  nextPremadeNumber: mocks.nextPremadeNumber,
}))
vi.mock('@/lib/gift-card-history', () => ({ logGiftCardEvent: mocks.logGiftCardEvent }))

import { GET, POST } from './route'

const get = (url: string) => new NextRequest(url)
const post = (body: unknown) =>
  ({ json: async () => body } as unknown as NextRequest)

const rows = [
  { id: 'c1', number: '20260001', amount: 50, redeemedAmount: 0, status: 'ISSUED' },
  { id: 'c2', number: '20260010', amount: 25, redeemedAmount: 5, status: 'SENT' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1', role: 'STAFF' })
  mocks.workerMayIssueGiftCards.mockResolvedValue(true)
  mocks.workerMayManageGiftCards.mockResolvedValue(false)
  mocks.prisma.giftCard.findMany.mockResolvedValue(rows)
  mocks.nextPremadeNumber.mockResolvedValue(null)
  mocks.logGiftCardEvent.mockResolvedValue(undefined)
})

describe('GET /api/worker/giftcards', () => {
  it('refuses without gift-card access', async () => {
    mocks.workerMayIssueGiftCards.mockResolvedValue(false)
    const res = await GET(get('http://localhost/api/worker/giftcards'))
    expect(res.status).toBe(403)
  })

  it('returns the module state when there is no query', async () => {
    mocks.prisma.giftCard.findMany.mockResolvedValue([{ id: 'd1', number: '20260011' }])
    const res = await GET(get('http://localhost/api/worker/giftcards'))
    const body = await res.json()
    expect(body).toMatchObject({
      allowed: true,
      canManage: false,
      draft: { id: 'd1', number: '20260011' },
      draftCount: 1,
    })
  })

  it('searches number, customer name and email within the session venue', async () => {
    const res = await GET(get('http://localhost/api/worker/giftcards?search=liam'))
    const body = await res.json()

    const call = mocks.prisma.giftCard.findMany.mock.calls[0][0]
    expect(call.where.venueId).toBe('v1')
    expect(call.where.deletedAt).toBeNull()
    expect(call.where.OR).toEqual([
      { number: { contains: 'liam' } },
      { customerName: { contains: 'liam', mode: 'insensitive' } },
      { customerEmail: { contains: 'liam', mode: 'insensitive' } },
    ])
    // Newest year-series first.
    expect(body.cards.map((c: { number: string }) => c.number)).toEqual(['20260010', '20260001'])
    expect(body.canManage).toBe(false)
  })

  it('lists blank cards for manual selection with a status filter', async () => {
    mocks.prisma.giftCard.findMany.mockResolvedValue([{ id: 'd1', number: '20260012', status: 'DRAFT' }])
    const res = await GET(get('http://localhost/api/worker/giftcards?status=DRAFT&list=1'))
    const body = await res.json()

    expect(mocks.prisma.giftCard.findMany.mock.calls[0][0].where).toMatchObject({
      venueId: 'v1',
      deletedAt: null,
      status: 'DRAFT',
    })
    expect(body.cards).toHaveLength(1)
  })
})

describe('POST /api/worker/giftcards', () => {
  it('issues a SPECIFIC draft when cardId is supplied', async () => {
    mocks.issueSpecificPremade.mockResolvedValue({
      id: 'draft-2',
      number: '20260002',
      amount: 25,
      status: 'ISSUED',
    })

    const res = await POST(post({ cardId: 'draft-2', amount: 25 }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(mocks.issueSpecificPremade).toHaveBeenCalledWith(
      'v1',
      'draft-2',
      expect.objectContaining({ amount: 25 }),
    )
    expect(mocks.issuePremade).not.toHaveBeenCalled()
    expect(mocks.logGiftCardEvent).toHaveBeenCalledWith('draft-2', 'ISSUED', expect.stringContaining('$25.00'))
    expect(body).toMatchObject({ cardId: 'draft-2', number: '20260002' })
  })

  it('falls back to the next premade draft without a cardId', async () => {
    mocks.issuePremade.mockResolvedValue({ id: 'd1', number: '20260001', amount: 10, status: 'ISSUED' })
    const res = await POST(post({ amount: 10 }))
    expect(res.status).toBe(201)
    expect(mocks.issuePremade).toHaveBeenCalled()
    expect(mocks.issueSpecificPremade).not.toHaveBeenCalled()
  })

  it('returns 409 when the chosen draft was already issued elsewhere', async () => {
    mocks.issueSpecificPremade.mockRejectedValue(
      new Error('CARD NO LONGER AVAILABLE — IT WAS ISSUED ELSEWHERE. REFRESH THE LIST.'),
    )
    const res = await POST(post({ cardId: 'draft-2', amount: 25 }))
    expect(res.status).toBe(409)
    expect(mocks.logGiftCardEvent).not.toHaveBeenCalled()
  })

  it('rejects an invalid amount with 400', async () => {
    const res = await POST(post({ amount: 0 }))
    expect(res.status).toBe(400)
    expect(mocks.issuePremade).not.toHaveBeenCalled()
  })
})
