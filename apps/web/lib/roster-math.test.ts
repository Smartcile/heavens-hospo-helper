import { describe, it, expect } from 'vitest'
import {
  shiftPaidHours,
  shiftCost,
  staffWeekTotals,
  rosterWeekSummary,
  colourForShift,
  formatStaffTotal,
  type RosterShift,
} from '@/lib/roster-math'

const shift = (over: Partial<RosterShift> = {}): RosterShift => ({
  id: 's1',
  staffId: 'st1',
  date: '2026-08-10',
  startTime: '09:00',
  endTime: '17:00',
  ...over,
})

describe('shiftPaidHours', () => {
  it('computes duration minus unpaid break', () => {
    expect(shiftPaidHours(shift())).toBe(8)
    expect(shiftPaidHours(shift({ breakMinutes: 30 }))).toBe(7.5)
  })

  it('handles midnight-crossing shifts', () => {
    expect(shiftPaidHours(shift({ startTime: '22:00', endTime: '02:00' }))).toBe(4)
  })

  it('clamps break minutes to the shift length', () => {
    expect(shiftPaidHours(shift({ startTime: '09:00', endTime: '10:00', breakMinutes: 120 }))).toBe(0)
  })
})

describe('shiftCost', () => {
  it('is hours × rate', () => {
    expect(shiftCost(shift(), 25)).toBe(200)
    expect(shiftCost(shift({ breakMinutes: 30 }), 23.5)).toBeCloseTo(176.25, 2)
  })

  it('is zero without a rate', () => {
    expect(shiftCost(shift(), null)).toBe(0)
  })
})

describe('staffWeekTotals', () => {
  it('sums hours and cost per staff member', () => {
    const totals = staffWeekTotals(
      [shift({ id: 'a', date: '2026-08-10' }), shift({ id: 'b', date: '2026-08-11', startTime: '10:00', endTime: '14:00' })],
      [{ staffId: 'st1', hourlyRate: 25 }]
    )
    const t = totals.get('st1')!
    expect(t.hours).toBe(12)
    expect(t.cost).toBe(300)
    expect(t.shiftCount).toBe(2)
  })
})

describe('rosterWeekSummary', () => {
  it('totals cost, budgeted sales, ratio and paid hours', () => {
    const rates = [{ staffId: 'st1', hourlyRate: 25 }]
    const shifts = [shift({ date: '2026-08-10' }), shift({ id: 'c', staffId: 'st1', date: '2026-08-12' })]
    const s = rosterWeekSummary(shifts, rates, { '2026-08-10': 1000, '2026-08-12': 1000 })
    expect(s.totalCost).toBe(400)
    expect(s.budgetedSales).toBe(2000)
    expect(s.staffingRatio).toBe(20)
    expect(s.totalPaidHours).toBe(16)
  })

  it('returns a 0 ratio when no budgeted sales', () => {
    const s = rosterWeekSummary([shift()], [{ staffId: 'st1', hourlyRate: 25 }], {})
    expect(s.staffingRatio).toBe(0)
    expect(s.budgetedSales).toBe(0)
  })
})

describe('colourForShift', () => {
  it('prefers the shift colour, then the position colour, then a stable fallback', () => {
    expect(colourForShift(shift({ colour: '#111111', positionColour: '#222222' }))).toBe('#111111')
    expect(colourForShift(shift({ colour: null, positionColour: '#222222' }))).toBe('#222222')
    const a = colourForShift(shift({ colour: null, positionColour: null, positionName: 'BARISTA' }))
    const b = colourForShift(shift({ colour: null, positionColour: null, positionName: 'BARISTA' }))
    expect(a).toBe(b)
    expect(a).toMatch(/^#/)
  })
})

describe('formatStaffTotal', () => {
  it('renders the hours/cost line', () => {
    expect(formatStaffTotal(47.25, 1858.34)).toBe('47.25HRS / $1,858.34')
    expect(formatStaffTotal(8, 200)).toBe('8HRS / $200.00')
  })
})
