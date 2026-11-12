import { describe, it, expect } from 'vitest'
import {
  describeRosterSlot,
  planSlotPlacement,
  validateRosterSlot,
} from '@/lib/roster-slot'

const valid = { name: 'DUTY MANAGER', startTime: '07:00', endTime: '16:00', breakMinutes: 30, headcount: 2 }

describe('validateRosterSlot', () => {
  it('accepts a valid slot', () => {
    expect(validateRosterSlot(valid)).toEqual([])
  })

  it('requires a name', () => {
    expect(validateRosterSlot({ ...valid, name: '  ' })).toContain('NAME IS REQUIRED')
  })

  it('requires HH:mm times', () => {
    expect(validateRosterSlot({ ...valid, startTime: '7am' })).toContain('START TIME MUST BE HH:mm')
    expect(validateRosterSlot({ ...valid, endTime: '25:00' })).toContain('END TIME MUST BE HH:mm')
  })

  it('rejects identical start and end times', () => {
    expect(validateRosterSlot({ ...valid, startTime: '09:00', endTime: '09:00' })).toContain('START AND END MUST DIFFER')
  })

  it('rejects a negative break', () => {
    expect(validateRosterSlot({ ...valid, breakMinutes: -1 })).toContain('BREAK MUST BE ZERO OR MORE')
  })

  it('requires headcount 1–50', () => {
    expect(validateRosterSlot({ ...valid, headcount: 0 })).toContain('HEADCOUNT MUST BE 1–50')
    expect(validateRosterSlot({ ...valid, headcount: 51 })).toContain('HEADCOUNT MUST BE 1–50')
    expect(validateRosterSlot({ ...valid, headcount: 1.5 })).toContain('HEADCOUNT MUST BE 1–50')
  })
})

describe('planSlotPlacement', () => {
  const staff = new Set(['s1', 's2', 's3'])

  it('selects valid staff and reports unfilled seats', () => {
    const plan = planSlotPlacement(3, ['s1'], staff)
    expect(plan.selected).toEqual(['s1'])
    expect(plan.skippedSeats).toBe(2)
    expect(plan.error).toBeNull()
  })

  it('de-duplicates selected staff', () => {
    const plan = planSlotPlacement(2, ['s1', 's1', 's2'], staff)
    expect(plan.selected).toEqual(['s1', 's2'])
    expect(plan.skippedSeats).toBe(0)
  })

  it('reports staff who are no longer active', () => {
    const plan = planSlotPlacement(2, ['s1', 'gone'], staff)
    expect(plan.selected).toEqual(['s1'])
    expect(plan.skippedStaffIds).toEqual(['gone'])
    expect(plan.skippedSeats).toBe(1)
  })

  it('errors when more staff are selected than the headcount', () => {
    const plan = planSlotPlacement(1, ['s1', 's2'], staff)
    expect(plan.error).toBe('ONLY 1 SEAT — SELECT FEWER STAFF')
    expect(plan.skippedSeats).toBe(0)
  })
})

describe('describeRosterSlot', () => {
  it('renders seats, times and role', () => {
    expect(describeRosterSlot({ name: 'DM', headcount: 1, startTime: '07:00', endTime: '16:00', positionName: 'DUTY MANAGER' }))
      .toBe('1 SEAT · 07:00–16:00 · DUTY MANAGER')
    expect(describeRosterSlot({ name: 'BAR', headcount: 3, startTime: '17:00', endTime: '23:00', positionName: null }))
      .toBe('3 SEATS · 17:00–23:00 · BAR')
  })
})
