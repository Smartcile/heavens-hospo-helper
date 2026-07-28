import { describe, it, expect, vi } from 'vitest'
import {
  giftCardNumberForYear,
  parseGiftCardNumber,
} from './gift-cards'

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    giftCard: {
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}))

describe('giftCardNumberForYear', () => {
  it('formats sequence 1 as 0001', () => {
    expect(giftCardNumberForYear(2026, 1)).toBe('20260001')
  })

  it('formats sequence 42 as 0042', () => {
    expect(giftCardNumberForYear(2026, 42)).toBe('20260042')
  })

  it('formats sequence 9999 with zero padding', () => {
    expect(giftCardNumberForYear(2026, 9999)).toBe('20269999')
  })

  it('handles different years', () => {
    expect(giftCardNumberForYear(2025, 100)).toBe('20250100')
  })
})

describe('parseGiftCardNumber', () => {
  it('parses valid number', () => {
    expect(parseGiftCardNumber('20260001')).toEqual({ year: 2026, sequence: 1 })
  })

  it('parses number with larger sequence', () => {
    expect(parseGiftCardNumber('20260123')).toEqual({ year: 2026, sequence: 123 })
  })

  it('returns null for invalid format', () => {
    expect(parseGiftCardNumber('abc')).toBeNull()
  })

  it('returns null for wrong length', () => {
    expect(parseGiftCardNumber('20261')).toBeNull()
  })

  it('returns null for non-numeric', () => {
    expect(parseGiftCardNumber('ABCD0001')).toBeNull()
  })
})
