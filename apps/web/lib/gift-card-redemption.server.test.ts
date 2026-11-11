import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    giftCard: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))

import { redeemGiftCard } from './gift-card-redemption.server'

const now = new Date('2026-11-11T00:00:00.000Z')

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    venueId: 'v1',
    number: '20260001',
    amount: 50,
    redeemedAmount: 0,
    status: 'ISSUED',
    expiresAt: null,
    redeemedAt: null,
    history: [{ at: '2026-11-01T00:00:00.000Z', type: 'ISSUED', note: 'PDF GENERATED' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.giftCard.findFirst.mockResolvedValue(card())
  prisma.giftCard.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...card(),
    ...data,
  }))
})

describe('redeemGiftCard', () => {
  it('returns 404 when the card is not in this venue', async () => {
    prisma.giftCard.findFirst.mockResolvedValue(null)
    const result = await redeemGiftCard('v1', 'missing', 10, now)
    expect(result.status).toBe(404)
    expect(prisma.giftCard.update).not.toHaveBeenCalled()
  })

  it('records a partial redemption and appends history', async () => {
    const result = await redeemGiftCard('v1', 'c1', 20, now)

    expect(result.status).toBe(200)
    expect(result.body.balance).toBe(30)
    expect(prisma.giftCard.update).toHaveBeenCalledTimes(1)
    const data = prisma.giftCard.update.mock.calls[0][0].data
    expect(data.redeemedAmount).toBe(20)
    expect(data.status).toBe('ISSUED')
    expect(data.redeemedAt).toBeUndefined()
    expect(data.history).toHaveLength(2)
    expect(data.history[1]).toMatchObject({ type: 'REDEEMED' })
    expect(data.history[1].note).toContain('$20.00')
    expect(data.history[1].note).toContain('$30.00 REMAINING')
  })

  it('marks the card REDEEMED when the full balance is used', async () => {
    const result = await redeemGiftCard('v1', 'c1', 50, now)

    expect(result.status).toBe(200)
    expect(result.body.balance).toBe(0)
    const data = prisma.giftCard.update.mock.calls[0][0].data
    expect(data.redeemedAmount).toBe(50)
    expect(data.status).toBe('REDEEMED')
    expect(data.redeemedAt).toEqual(now)
    expect(data.history[1].note).toContain('FULL BALANCE USED')
  })

  it('refuses an over-balance redemption without writing', async () => {
    const result = await redeemGiftCard('v1', 'c1', 60, now)
    expect(result.status).toBe(409)
    expect(prisma.giftCard.update).not.toHaveBeenCalled()
  })

  it('refuses a voided card without writing', async () => {
    prisma.giftCard.findFirst.mockResolvedValue(card({ status: 'VOIDED' }))
    const result = await redeemGiftCard('v1', 'c1', 10, now)
    expect(result.status).toBe(409)
    expect(prisma.giftCard.update).not.toHaveBeenCalled()
  })

  it('stamps an expired card EXPIRED and refuses the redemption', async () => {
    prisma.giftCard.findFirst.mockResolvedValue(
      card({ expiresAt: new Date('2026-11-01T00:00:00.000Z') }),
    )
    const result = await redeemGiftCard('v1', 'c1', 10, now)

    expect(result.status).toBe(409)
    expect(prisma.giftCard.update).toHaveBeenCalledTimes(1)
    const data = prisma.giftCard.update.mock.calls[0][0].data
    expect(data.status).toBe('EXPIRED')
    expect(data.history[1]).toMatchObject({ type: 'STATUS' })
  })

  it('rejects a zero amount with 400', async () => {
    const result = await redeemGiftCard('v1', 'c1', 0, now)
    expect(result.status).toBe(400)
    expect(prisma.giftCard.update).not.toHaveBeenCalled()
  })
})
