import { describe, it, expect } from 'vitest'
import {
  giftCardNumberForYear,
  parseGiftCardNumber,
  giftCardSortValue,
  GIFT_CARD_YEAR_MAX_SEQUENCE,
} from './gift-card-numbers'

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
    expect(giftCardNumberForYear(2027, 1)).toBe('20270001')
  })
})

describe('parseGiftCardNumber', () => {
  it('parses valid numbers', () => {
    expect(parseGiftCardNumber('20260001')).toEqual({ year: 2026, sequence: 1 })
    expect(parseGiftCardNumber('20260123')).toEqual({ year: 2026, sequence: 123 })
  })

  it('rejects invalid formats', () => {
    expect(parseGiftCardNumber('abc')).toBeNull()
    expect(parseGiftCardNumber('20261')).toBeNull()
    expect(parseGiftCardNumber('ABCD0001')).toBeNull()
    expect(parseGiftCardNumber('0005')).toBeNull() // retired pool format is not a year card
    expect(parseGiftCardNumber('20260000')).toBeNull() // sequence 0 is invalid
  })
})

describe('giftCardSortValue', () => {
  it('sorts year-series numerically', () => {
    expect(giftCardSortValue('20260001') < giftCardSortValue('20260002')).toBe(true)
    expect(giftCardSortValue('20260009') < giftCardSortValue('20260010')).toBe(true)
    expect(giftCardSortValue('20269999') > giftCardSortValue('20260100')).toBe(true)
  })

  it('orders older-year leftovers before the current series', () => {
    expect(giftCardSortValue('20250007') < giftCardSortValue('20260001')).toBe(true)
  })

  it('sorts legacy pool rows below the year series', () => {
    expect(giftCardSortValue('0005') < giftCardSortValue('20260001')).toBe(true)
  })
})

it('the max sequence is 9999', () => {
  expect(GIFT_CARD_YEAR_MAX_SEQUENCE).toBe(9999)
})
