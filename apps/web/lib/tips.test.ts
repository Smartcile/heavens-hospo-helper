import { describe, it, expect } from 'vitest'
import {
  cashTotalOf,
  cleanCashCounts,
  cleanShares,
  denominationLabel,
  distributeTips,
  round2,
  shareLabel,
  summariseTips,
  totalTips,
} from '@/lib/tips'

const workbookShares = [
  { name: 'LIAM', hours: 705, shareWeight: 1 },
  { name: 'SHAYLA', hours: 634, shareWeight: 1 },
  { name: 'LUZ', hours: 487, shareWeight: 0.75 },
  { name: 'OLIVIA', hours: 435, shareWeight: 0.75 },
  { name: 'BETHANY', hours: 356, shareWeight: 0.5 },
  { name: 'SOMER', hours: 287, shareWeight: 0.25 },
  { name: 'ELLA', hours: 273, shareWeight: 0.25 },
  { name: 'OLIVER', hours: 257, shareWeight: 0.25 },
  { name: 'BRIDGET', hours: 243, shareWeight: 0.25 },
  { name: 'GRACE', hours: 243, shareWeight: 0.25 },
  { name: 'LOLA', hours: 204, shareWeight: 0.25 },
  { name: 'HAYLEY', hours: 200, shareWeight: 0.25 },
  { name: 'RUI', hours: 835, shareWeight: 0.2 },
  { name: 'BEN', hours: 721, shareWeight: 0.2 },
  { name: 'YUEYANG', hours: 604, shareWeight: 0.2 },
  { name: 'RAMA', hours: 567, shareWeight: 0.2 },
  { name: 'SEBASTIAN', hours: 558, shareWeight: 0.2 },
  { name: 'MARK', hours: 529, shareWeight: 0.2 },
  { name: 'NISHAL', hours: 502, shareWeight: 0.2 },
  { name: 'JIANKUN', hours: 317, shareWeight: 0.2 },
  { name: 'NEVE', hours: 176, shareWeight: 0.2 },
  { name: 'MAIA', hours: 174, shareWeight: 0.2 },
  { name: 'JOSIE', hours: 123, shareWeight: 0.2 },
  { name: 'CAMPBELL', hours: 117, shareWeight: 0.1 },
  { name: 'WILLIAM', hours: 104, shareWeight: 0.1 },
  { name: 'SUMMER', hours: 83, shareWeight: 0.1 },
  { name: 'MANOJ', hours: 81, shareWeight: 0.1 },
]

describe('tips', () => {
  it('cashTotalOf sums denominations x quantity', () => {
    expect(cashTotalOf({ '100': 5, '50': 1, '20': 1, '10': 1, '5': 1, '2': 1, '0.5': 1, '0.2': 2 })).toBe(587.9)
    expect(cashTotalOf({})).toBe(0)
    expect(cashTotalOf(null)).toBe(0)
  })

  it('totalTips adds cash and POS', () => {
    expect(totalTips(587.9, 1000)).toBe(1587.9)
    expect(totalTips(NaN, 1000)).toBe(1000)
  })

  it('distributeTips matches the workbook (1587.90 across 8.35 units)', () => {
    const result = distributeTips(1587.9, workbookShares)
    const summary = summariseTips(1587.9, workbookShares)
    expect(round2(summary.perUnit)).toBe(190.17)
    expect(round2(result[0].value)).toBe(190.17) // FULL
    expect(round2(result[2].value)).toBe(142.63) // 3/4
    expect(round2(result[4].value)).toBe(95.08) // HALF
    expect(round2(result[5].value)).toBe(47.54) // 1/4
    expect(round2(result[12].value)).toBe(38.03) // MAIN KITCHEN
    expect(round2(result[23].value)).toBe(19.02) // SMALL KITCHEN
    expect(summary.weightTotal).toBeCloseTo(8.35, 10)
    expect(summary.difference).toBe(0)
  })

  it('distributeTips is safe with no weights', () => {
    const result = distributeTips(100, [{ name: 'A', hours: 0, shareWeight: 0 }])
    expect(result[0].value).toBe(0)
    expect(summariseTips(100, []).perUnit).toBe(0)
  })

  it('shareLabel resolves the preset tiers', () => {
    expect(shareLabel(0.2)).toBe('MAIN KITCHEN')
    expect(shareLabel(0.25)).toBe('1/4 SHARE')
    expect(shareLabel(0.33)).toBeNull()
  })

  it('denominationLabel formats notes and coins', () => {
    expect(denominationLabel(100)).toBe('$100')
    expect(denominationLabel(0.5)).toBe('$0.50')
    expect(denominationLabel(0.2)).toBe('$0.20')
  })

  it('cleanCashCounts drops unknown and empty denominations', () => {
    expect(cleanCashCounts({ '100': 2, '50': 0, '7': 9, '0.2': 3 })).toEqual({ '100': 2, '0.2': 3 })
    expect(cleanCashCounts(null)).toEqual({})
  })

  it('cleanShares uppercases names, coerces numbers and drops blanks', () => {
    expect(
      cleanShares([
        { name: ' liam ', hours: '705', shareWeight: 1 },
        { name: '', hours: 10, shareWeight: 1 },
        { name: 'shayla', hours: -3, shareWeight: 0 },
      ]),
    ).toEqual([
      { name: 'LIAM', hours: 705, shareWeight: 1 },
      { name: 'SHAYLA', hours: 0, shareWeight: 0 },
    ])
    expect(cleanShares('nope')).toEqual([])
  })
})
