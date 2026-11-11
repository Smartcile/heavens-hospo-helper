import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    giftCard: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
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
  prisma.giftCard.updateMany.mockResolvedValue({ count: 1 })
  prisma.giftCard.findUnique.mockImplementation(async () => card())
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('redeemGiftCard', () => {
  it('returns 404 when the card is not in this venue', async () => {
    prisma.giftCard.findFirst.mockResolvedValue(null)
    const result = await redeemGiftCard('v1', 'missing', 10, { now })
    expect(result.status).toBe(404)
    expect(prisma.giftCard.updateMany).not.toHaveBeenCalled()
  })

  it('records a partial redemption atomically and appends history', async () => {
    const result = await redeemGiftCard('v1', 'c1', 20, { now })

    expect(result.status).toBe(200)
    expect(result.body.balance).toBe(30)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.giftCard.updateMany).toHaveBeenCalledTimes(1)
    const call = prisma.giftCard.updateMany.mock.calls[0][0]
    // Optimistic guard: only the read state may be updated.
    expect(call.where).toMatchObject({
      id: 'c1',
      venueId: 'v1',
      redeemedAmount: 0,
      status: { in: ['ISSUED', 'SENT'] },
    })
    expect(call.data.redeemedAmount).toBe(20)
    expect(call.data.status).toBe('ISSUED')
    expect(call.data.redeemedAt).toBeNull()
    expect(call.data.history).toHaveLength(2)
    expect(call.data.history[1]).toMatchObject({ type: 'REDEEMED' })
    expect(call.data.history[1].note).toContain('$20.00')
    expect(call.data.history[1].note).toContain('$30.00 REMAINING')
    // The response shape never selects admin-private notes.
    const findCall = prisma.giftCard.findUnique.mock.calls[0][0]
    expect(findCall.select).toMatchObject({ history: true })
    expect(findCall.select.notes).toBeUndefined()
  })

  it('clears a stale redeemedAt on a partial redemption', async () => {
    prisma.giftCard.findFirst.mockResolvedValue(card({ redeemedAt: new Date('2026-11-02T00:00:00.000Z') }))
    await redeemGiftCard('v1', 'c1', 10, { now })
    expect(prisma.giftCard.updateMany.mock.calls[0][0].data.redeemedAt).toBeNull()
  })

  it('records the acting staff member in the history entry', async () => {
    await redeemGiftCard('v1', 'c1', 10, { now, actor: 'ANN' })
    const history = prisma.giftCard.updateMany.mock.calls[0][0].data.history
    expect(history[history.length - 1].note).toContain('BY ANN')
  })

  it('marks the card REDEEMED when the full balance is used', async () => {
    const result = await redeemGiftCard('v1', 'c1', 50, { now })

    expect(result.status).toBe(200)
    expect(result.body.balance).toBe(0)
    const data = prisma.giftCard.updateMany.mock.calls[0][0].data
    expect(data.redeemedAmount).toBe(50)
    expect(data.status).toBe('REDEEMED')
    expect(data.redeemedAt).toEqual(now)
    expect(data.history[1].note).toContain('FULL BALANCE USED')
  })

  it('returns 409 and writes once when the conditional update loses a race', async () => {
    prisma.giftCard.updateMany.mockResolvedValue({ count: 0 })

    const result = await redeemGiftCard('v1', 'c1', 20, { now })

    expect(result.status).toBe(409)
    expect(result.body.error).toContain('CHANGED WHILE REDEEMING')
    expect(prisma.giftCard.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.giftCard.findUnique).not.toHaveBeenCalled()
  })

  it('refuses an over-balance redemption without writing', async () => {
    const result = await redeemGiftCard('v1', 'c1', 60, { now })
    expect(result.status).toBe(409)
    expect(prisma.giftCard.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a voided card without writing', async () => {
    prisma.giftCard.findFirst.mockResolvedValue(card({ status: 'VOIDED' }))
    const result = await redeemGiftCard('v1', 'c1', 10, { now })
    expect(result.status).toBe(409)
    expect(prisma.giftCard.updateMany).not.toHaveBeenCalled()
  })

  it('stamps an expired card EXPIRED conditionally and refuses the redemption', async () => {
    prisma.giftCard.findFirst.mockResolvedValue(
      card({ expiresAt: new Date('2026-11-01T00:00:00.000Z') }),
    )
    const result = await redeemGiftCard('v1', 'c1', 10, { now })

    expect(result.status).toBe(409)
    expect(prisma.giftCard.updateMany).toHaveBeenCalledTimes(1)
    const call = prisma.giftCard.updateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ redeemedAmount: 0, status: 'ISSUED' })
    expect(call.data.status).toBe('EXPIRED')
    expect(call.data.history[1]).toMatchObject({ type: 'STATUS' })
    expect(prisma.giftCard.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a zero amount with 400', async () => {
    const result = await redeemGiftCard('v1', 'c1', 0, { now })
    expect(result.status).toBe(400)
    expect(prisma.giftCard.updateMany).not.toHaveBeenCalled()
  })
})
