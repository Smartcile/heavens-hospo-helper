import { describe, it, expect } from 'vitest'
import {
  isCardExpired,
  nextRedemptionState,
  remainingBalance,
  roundMoney,
  validateRedemption,
  type RedeemableCard,
} from './gift-card-redemption'

const base: RedeemableCard = {
  number: '20260001',
  amount: 50,
  redeemedAmount: 0,
  status: 'ISSUED',
  expiresAt: null,
}

const now = new Date('2026-11-11T00:00:00.000Z')

describe('remainingBalance', () => {
  it('returns the full amount when nothing is redeemed', () => {
    expect(remainingBalance({ amount: 50 })).toBe(50)
  })

  it('subtracts partial redemptions', () => {
    expect(remainingBalance({ amount: 50, redeemedAmount: 20 })).toBe(30)
  })

  it('clamps at zero when over-redeemed data exists', () => {
    expect(remainingBalance({ amount: 50, redeemedAmount: 70 })).toBe(0)
  })

  it('rounds to cents', () => {
    expect(remainingBalance({ amount: 50, redeemedAmount: 0.1 })).toBe(49.9)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })
})

describe('isCardExpired', () => {
  it('is false without an expiry date', () => {
    expect(isCardExpired({ expiresAt: null }, now)).toBe(false)
  })

  it('is true for a past date and false for a future date', () => {
    expect(isCardExpired({ expiresAt: '2026-11-10T00:00:00.000Z' }, now)).toBe(true)
    expect(isCardExpired({ expiresAt: '2026-12-01T00:00:00.000Z' }, now)).toBe(false)
  })
})

describe('validateRedemption', () => {
  it('rejects zero, negative and non-numeric amounts with 400', () => {
    expect(validateRedemption(base, 0, now)?.status).toBe(400)
    expect(validateRedemption(base, -5, now)?.status).toBe(400)
    expect(validateRedemption(base, 'abc', now)?.status).toBe(400)
  })

  it('rejects a draft / voided / expired / redeemed card with 409', () => {
    for (const status of ['DRAFT', 'VOIDED', 'EXPIRED', 'REDEEMED']) {
      expect(validateRedemption({ ...base, status }, 10, now)?.status).toBe(409)
    }
  })

  it('rejects a card whose expiry date has passed', () => {
    const error = validateRedemption({ ...base, expiresAt: '2026-11-01T00:00:00.000Z' }, 10, now)
    expect(error?.status).toBe(409)
    expect(error?.error).toContain('EXPIRED')
  })

  it('rejects an amount above the remaining balance with 409', () => {
    const error = validateRedemption({ ...base, redeemedAmount: 40 }, 20, now)
    expect(error?.status).toBe(409)
    expect(error?.error).toContain('ONLY $10.00 REMAINS')
  })

  it('allows a partial or full redemption', () => {
    expect(validateRedemption(base, 10, now)).toBeNull()
    expect(validateRedemption(base, 50, now)).toBeNull()
  })

  it('rejects a card with no balance left', () => {
    expect(validateRedemption({ ...base, redeemedAmount: 50 }, 10, now)?.status).toBe(409)
  })
})

describe('nextRedemptionState', () => {
  it('keeps the current status on a partial redemption', () => {
    const next = nextRedemptionState(base, 20, now)
    expect(next).toEqual({ redeemedAmount: 20, status: 'ISSUED', redeemedAt: null })
  })

  it('marks a fully redeemed card REDEEMED and stamps the date', () => {
    const next = nextRedemptionState({ ...base, status: 'SENT' }, 50, now)
    expect(next.redeemedAmount).toBe(50)
    expect(next.status).toBe('REDEEMED')
    expect(next.redeemedAt).toEqual(now)
  })

  it('completes a card from a partial balance', () => {
    const next = nextRedemptionState({ ...base, redeemedAmount: 35 }, 15, now)
    expect(next.redeemedAmount).toBe(50)
    expect(next.status).toBe('REDEEMED')
  })
})
