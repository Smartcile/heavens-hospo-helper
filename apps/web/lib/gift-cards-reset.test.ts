import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    giftCard: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  logGiftCardEvent: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('./gift-card-history', () => ({
  logGiftCardEvent: mocks.logGiftCardEvent,
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
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.giftCard.findFirst.mockResolvedValue(card())
  mocks.prisma.giftCard.update.mockResolvedValue({ id: 'c1' })
  mocks.prisma.giftCard.findUnique.mockResolvedValue(card({ status: 'DRAFT', amount: 0 }))
})

describe('resetGiftCardToDraft', () => {
  it('reuses the same number, clears value/redemption and keeps history', async () => {
    const result = await resetGiftCardToDraft('v1', 'c1')

    expect(result.ok).toBe(true)
    const update = mocks.prisma.giftCard.update.mock.calls[0][0]
    expect(update.data).toMatchObject({
      status: 'DRAFT',
      amount: 0,
      redeemedAmount: 0,
      redeemedAt: null,
      customerName: null,
      pdfPath: null,
    })
    // The number is never rewritten — reuse keeps it.
    expect(update.data.number).toBeUndefined()
    expect(mocks.logGiftCardEvent).toHaveBeenCalledWith('c1', 'RESET', expect.stringContaining('HISTORY KEPT'))
  })

  it('refuses a card that is itself a replacement', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(card({ replacesId: 'old' }))
    const result = await resetGiftCardToDraft('v1', 'c1')
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(mocks.prisma.giftCard.update).not.toHaveBeenCalled()
  })

  it('refuses a voided card whose number was replaced', async () => {
    mocks.prisma.giftCard.findFirst
      .mockResolvedValueOnce(card({ status: 'VOIDED' }))
      .mockResolvedValueOnce({ number: '20260009' })

    const result = await resetGiftCardToDraft('v1', 'c1')
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(result.ok ? '' : result.error).toContain('REPLACED BY #20260009')
    expect(mocks.prisma.giftCard.update).not.toHaveBeenCalled()
  })

  it('only resets ISSUED / SENT / VOIDED cards', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(card({ status: 'DRAFT' }))
    const result = await resetGiftCardToDraft('v1', 'c1')
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(mocks.prisma.giftCard.update).not.toHaveBeenCalled()
  })
})
