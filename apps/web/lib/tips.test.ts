import { describe, it, expect } from 'vitest'
import {
  canTransitionTipsShare,
  cashRound,
  cashTotalOf,
  cleanCashCounts,
  cleanShares,
  cleanTipsShareRows,
  denominationLabel,
  distributeCashRounded,
  distributeTips,
  hoursShare,
  isTipsPeriodLocked,
  isTipsShareEditable,
  matchLegacyTipStaff,
  round2,
  shareLabel,
  suggestedAmount,
  suggestedWeight,
  summariseTips,
  tipsProgress,
  totalTips,
  valueTipsShares,
  type TipsShareRow,
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

describe('relational tip shares', () => {
  const row = (over: Partial<TipsShareRow> = {}): TipsShareRow => ({
    staffId: null,
    name: 'A',
    hours: 0,
    shareWeight: 1,
    sortOrder: 0,
    status: 'PLANNED',
    ...over,
  })

  it('hoursShare is the fraction of total hours', () => {
    expect(hoursShare(75, 100)).toBeCloseTo(0.75)
    expect(hoursShare(0, 0)).toBe(0)
    expect(hoursShare(10, 0)).toBe(0)
  })

  it('suggestedWeight scales hours proportion so suggestions sum to headcount', () => {
    expect(suggestedWeight(75, 100, 2)).toBe(1.5)
    expect(suggestedWeight(25, 100, 2)).toBe(0.5)
    expect(suggestedWeight(10, 0, 2)).toBe(0)
  })

  it('suggestedAmount is the hours-proportional payout suggestion', () => {
    expect(suggestedAmount(1000, 75, 100)).toBe(750)
    expect(suggestedAmount(1000, 10, 0)).toBe(0)
  })

  it('cashRound rounds to the nearest 10c', () => {
    expect(cashRound(10.04)).toBe(10)
    expect(cashRound(10.06)).toBe(10.1)
  })

  it('distributeCashRounded reconciles a 3-way split with largest remainder', () => {
    const amounts = distributeCashRounded(100, [
      { shareWeight: 1 },
      { shareWeight: 1 },
      { shareWeight: 1 },
    ])
    expect(amounts).toEqual([33.4, 33.3, 33.3])
    expect(round2(amounts.reduce((a, b) => a + b, 0))).toBe(100)
  })

  it('distributeCashRounded matches the nearest-10c pool and never loses a cent', () => {
    const amounts = distributeCashRounded(100.04, [{ shareWeight: 1 }, { shareWeight: 1 }])
    expect(amounts).toEqual([50, 50])
    // nearest 10c of 100.04 is 100.00
    expect(round2(amounts.reduce((a, b) => a + b, 0))).toBe(100)
  })

  it('distributeCashRounded pays nobody when every weight is zero', () => {
    expect(distributeCashRounded(100, [{ shareWeight: 0 }, { shareWeight: 0 }])).toEqual([0, 0])
  })

  it('distributeCashRounded handles a zero total and a single person', () => {
    expect(distributeCashRounded(0, [{ shareWeight: 1 }, { shareWeight: 1 }])).toEqual([0, 0])
    expect(distributeCashRounded(12.34, [{ shareWeight: 1 }])).toEqual([12.3])
    expect(distributeCashRounded(0.06, [{ shareWeight: 1 }])).toEqual([0.1])
  })

  it('valueTipsShares attaches hours share, suggestions and reconciled amounts', () => {
    const values = valueTipsShares(100, [
      row({ name: 'A', hours: 3, shareWeight: 1 }),
      row({ name: 'B', hours: 1, shareWeight: 1 }),
    ])
    expect(values[0].hoursShare).toBeCloseTo(0.75)
    // Payout follows shareWeight (1 each), not hours — 50/50.
    expect(values[0].amount).toBe(50)
    expect(values[1].amount).toBe(50)
    expect(values[0].suggestedAmount).toBe(75)
    expect(round2(values.reduce((sum, v) => sum + v.amount, 0))).toBe(100)
  })

  it('tipsProgress counts stages and reports percentages', () => {
    expect(tipsProgress([])).toMatchObject({ total: 0, percent: 0, stage: 'PLANNED', complete: false })
    const progress = tipsProgress([
      { status: 'PLANNED' },
      { status: 'APPROVED' },
      { status: 'ISSUED' },
      { status: 'FULLY_ISSUED' },
    ])
    expect(progress).toMatchObject({
      total: 4,
      planned: 1,
      approved: 1,
      issued: 1,
      fullyIssued: 1,
      issuedCount: 2,
      percent: 50,
      approvedPercent: 75,
      stage: 'ISSUED',
      complete: false,
    })
    expect(tipsProgress([{ status: 'FULLY_ISSUED' }, { status: 'FULLY_ISSUED' }])).toMatchObject({
      stage: 'FULLY_ISSUED',
      complete: true,
      percent: 100,
    })
  })

  it('only allows PLANNED -> APPROVED -> ISSUED -> FULLY_ISSUED', () => {
    expect(canTransitionTipsShare('PLANNED', 'APPROVED')).toBe(true)
    expect(canTransitionTipsShare('PLANNED', 'ISSUED')).toBe(false)
    expect(canTransitionTipsShare('APPROVED', 'ISSUED')).toBe(true)
    expect(canTransitionTipsShare('ISSUED', 'FULLY_ISSUED')).toBe(true)
    expect(canTransitionTipsShare('FULLY_ISSUED', 'ISSUED')).toBe(false)
  })

  it('editable only before issuance', () => {
    expect(isTipsShareEditable('PLANNED')).toBe(true)
    expect(isTipsShareEditable('APPROVED')).toBe(true)
    expect(isTipsShareEditable('ISSUED')).toBe(false)
    expect(isTipsShareEditable('FULLY_ISSUED')).toBe(false)
    expect(isTipsPeriodLocked([{ status: 'PLANNED' }, { status: 'ISSUED' }])).toBe(true)
    expect(isTipsPeriodLocked([{ status: 'PLANNED' }])).toBe(false)
  })

  it('cleanTipsShareRows uppercases names, coerces numbers and dedupes staff', () => {
    expect(
      cleanTipsShareRows([
        { id: 'r1', staffId: 's1', name: 'ignored', hours: '4', shareWeight: '1.5', sortOrder: 0 },
        { staffId: 's1', name: 'duplicate', hours: 1, shareWeight: 1 },
        { staffId: null, name: ' manual ', hours: -2, shareWeight: -1 },
        { staffId: null, name: '   ', hours: 3, shareWeight: 1 },
      ]),
    ).toEqual([
      { id: 'r1', staffId: 's1', name: 'IGNORED', hours: 4, shareWeight: 1.5, sortOrder: 0 },
      { id: undefined, staffId: null, name: 'MANUAL', hours: 0, shareWeight: 1, sortOrder: 2 },
    ])
    expect(cleanTipsShareRows('nope')).toEqual([])
  })

  it('matches a legacy name only when it is unambiguous', () => {
    const staff = [
      { id: 's1', firstName: 'LIAM', lastName: 'SMITH' },
      { id: 's2', firstName: 'LIAM', lastName: 'JONES' },
    ]
    expect(matchLegacyTipStaff('Liam Smith', staff)).toBe('s1')
    expect(matchLegacyTipStaff('LIAM', staff)).toBeNull()
    expect(matchLegacyTipStaff('NOBODY', staff)).toBeNull()
  })
})
