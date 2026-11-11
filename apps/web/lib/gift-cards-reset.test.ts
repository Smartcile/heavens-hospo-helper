import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    giftCard: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('./gift-card-history', () => ({
  appendHistoryEvent: vi.fn((history: unknown[], type: string, note: string) => [
    ...history,
    { at: '2026-11-11T00:00:00.000Z', type, note },
  ]),
  logGiftCardEvent: vi.fn(),
  logOrderEvent: vi.fn(),
}))
vi.mock('./gift-card-issue', () => ({ issueGiftCardPdf: vi.fn() }))

import { resetGiftCardToDraft } from './gift-cards'

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    venueId: 'v1',
    number: '20260001',
    amount: 40,
    redeemedAmount: 10,
    redeemedAt: new Date(),
    status: 'ISSUED',
    replacesId: null,
    history: [{ at: '2026-11-01T00:00:00.000Z', type: 'ISSUED', note: 'PDF GENERATED' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.giftCard.findFirst.mockResolvedValue(card())
  mocks.prisma.giftCard.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.giftCard.findUnique.mockResolvedValue(card({ status: 'DRAFT', amount: 0 }))
})

describe('resetGiftCardToDraft', () => {
  it('reuses the same number, clears value/redemption and appends RESET history atomically', async () => {
    const result = await resetGiftCardToDraft('v1', 'c1')

    expect(result.ok).toBe(true)
    const call = mocks.prisma.giftCard.updateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({
      id: 'c1',
      venueId: 'v1',
      status: 'ISSUED',
      redeemedAmount: 10,
    })
    expect(call.data).toMatchObject({
      status: 'DRAFT',
      amount: 0,
      redeemedAmount: 0,
      redeemedAt: null,
      customerName: null,
      pdfPath: null,
    })
    // The number is never rewritten — reuse keeps it.
    expect(call.data.number).toBeUndefined()
    expect(call.data.history).toHaveLength(2)
    expect(call.data.history[1]).toMatchObject({ type: 'RESET' })
    expect(call.data.history[1].note).toContain('HISTORY KEPT')
  })

  it('returns 409 and writes nothing when the card changed after it was read', async () => {
    mocks.prisma.giftCard.updateMany.mockResolvedValue({ count: 0 })
    const result = await resetGiftCardToDraft('v1', 'c1')
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(result.ok ? '' : result.error).toContain('CHANGED WHILE RESETTING')
    expect(mocks.prisma.giftCard.findUnique).not.toHaveBeenCalled()
  })

  it('refuses a card that is itself a replacement', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(card({ replacesId: 'old' }))
    const result = await resetGiftCardToDraft('v1', 'c1')
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(mocks.prisma.giftCard.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a voided card whose number was replaced', async () => {
    mocks.prisma.giftCard.findFirst
      .mockResolvedValueOnce(card({ status: 'VOIDED' }))
      .mockResolvedValueOnce({ number: '20260009' })

    const result = await resetGiftCardToDraft('v1', 'c1')
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(result.ok ? '' : result.error).toContain('REPLACED BY #20260009')
    expect(mocks.prisma.giftCard.updateMany).not.toHaveBeenCalled()
  })

  it('only resets ISSUED / SENT / VOIDED cards', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(card({ status: 'DRAFT' }))
    const result = await resetGiftCardToDraft('v1', 'c1')
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(mocks.prisma.giftCard.updateMany).not.toHaveBeenCalled()
  })
})
