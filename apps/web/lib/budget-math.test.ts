import { describe, it, expect } from 'vitest'
import { generateDailyBudgetsNormalized, computeBreakdowns } from '@/lib/budget-math'
import type { CategoryInput, DayInput, BreakdownInput } from '@/lib/budget-math'

const revenueCat: CategoryInput = { id: 'rev', name: 'REVENUE', percentage: 100 }

function makeDays(year: number, month: number, count: number): DayInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `day-${i + 1}`,
    date: new Date(Date.UTC(year, month - 1, i + 1)),
    dayOfWeek: new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay(),
    isWorkingDay: new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay() !== 0 && new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay() !== 6,
  }))
}

const defaultWeights = { mon: 15, tue: 15, wed: 15, thu: 15, fri: 15, sat: 10, sun: 15 }

describe('generateDailyBudgetsNormalized', () => {
  it('allocates budget across working days', () => {
    const days = makeDays(2026, 7, 31)
    const result = generateDailyBudgetsNormalized(50000, [revenueCat], defaultWeights, days)
    expect(result.allocations).toHaveLength(31)
    expect(result.metadata.targetTotal).toBe(50000)
  })

  it('handles zero working days', () => {
    const days: DayInput[] = [{ id: '1', date: new Date('2026-01-01'), dayOfWeek: 0, isWorkingDay: false }]
    const result = generateDailyBudgetsNormalized(50000, [revenueCat], defaultWeights, days)
    expect(result.metadata.allocatedTotal).toBe(0)
    expect(result.metadata.variance).toBe(-50000)
  })

  it('handles zero total weight', () => {
    const days: DayInput[] = [{ id: '1', date: new Date('2026-01-01'), dayOfWeek: 1, isWorkingDay: true }]
    const zeroWeights = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
    const result = generateDailyBudgetsNormalized(50000, [revenueCat], zeroWeights, days)
    expect(result.metadata.allocatedTotal).toBe(0)
  })

  it('respects existing allocation override for single-category budgets', () => {
    const days = makeDays(2026, 7, 31)
    const existing = new Map<string, number>()
    const firstWorkingDay = days.find(d => d.isWorkingDay)
    if (!firstWorkingDay) return
    existing.set(firstWorkingDay.id, 5000)
    const result = generateDailyBudgetsNormalized(50000, [revenueCat], defaultWeights, days, existing)
    const workingAllocs = result.allocations.filter(a => a.isWorkingDay)
    expect(workingAllocs.length).toBeGreaterThan(0)
    // Existing allocation is honored (may get bumped by post-rounding correction)
    const firstWorking = workingAllocs[0]
    expect(firstWorking.dayTotal).toBeGreaterThanOrEqual(5000)
  })

  it('ensures allocated does not go below target', () => {
    const days = makeDays(2026, 7, 5).filter(d => d.isWorkingDay)
    const result = generateDailyBudgetsNormalized(10000, [revenueCat], defaultWeights, days)
    expect(result.metadata.allocatedTotal).toBeGreaterThanOrEqual(result.metadata.targetTotal)
  })
})

describe('computeBreakdowns', () => {
  it('computes category breakdowns from revenue', () => {
    const days = makeDays(2026, 7, 1)
    const result = generateDailyBudgetsNormalized(10000, [revenueCat], defaultWeights, days)
    const breakdownCats: BreakdownInput[] = [
      { id: 'bev', name: 'BEVERAGE', percentage: 30 },
      { id: 'food', name: 'FOOD', percentage: 50 },
      { id: 'rem', name: 'REMAINDER', percentage: 20 },
    ]
    const withBreakdowns = computeBreakdowns(result, breakdownCats)
    expect(withBreakdowns.allocations).toHaveLength(1)
    if (withBreakdowns.allocations[0].isWorkingDay) {
      expect(withBreakdowns.allocations[0].breakdowns.length).toBeGreaterThan(0)
    }
  })

  it('handles non-working days (empty breakdowns)', () => {
    const days: DayInput[] = [{ id: '1', date: new Date('2026-01-01'), dayOfWeek: 0, isWorkingDay: false }]
    const result = generateDailyBudgetsNormalized(10000, [revenueCat], defaultWeights, days)
    const breakdownCats: BreakdownInput[] = [{ id: 'bev', name: 'BEVERAGE', percentage: 30 }]
    const withBreakdowns = computeBreakdowns(result, breakdownCats)
    expect(withBreakdowns.allocations[0].breakdowns).toEqual([])
  })

  it('skips zero-percentage categories', () => {
    const days = makeDays(2026, 7, 1)
    const result = generateDailyBudgetsNormalized(10000, [revenueCat], defaultWeights, days)
    const breakdownCats: BreakdownInput[] = [
      { id: 'zero', name: 'ZERO', percentage: 0 },
    ]
    const withBreakdowns = computeBreakdowns(result, breakdownCats)
    const working = withBreakdowns.allocations.find(d => d.isWorkingDay)
    if (working) {
      expect(working.breakdowns).toEqual([])
    }
  })
})
