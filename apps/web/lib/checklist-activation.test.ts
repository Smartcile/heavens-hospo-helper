import { describe, it, expect } from 'vitest'
import { dayKey, isActivatedOn, isChecklistOpen, isChecklistHidden } from '@/lib/checklist-activation'

const day = new Date('2026-10-02T00:00:00.000Z')

describe('checklist-activation', () => {
  it('dayKey reduces a date to its calendar day', () => {
    expect(dayKey(new Date('2026-10-02T15:30:00.000Z'))).toBe('2026-10-02')
  })

  it('isActivatedOn only matches the same venue-day', () => {
    expect(isActivatedOn(new Date('2026-10-02T00:00:00.000Z'), day)).toBe(true)
    expect(isActivatedOn(new Date('2026-10-01T00:00:00.000Z'), day)).toBe(false)
    expect(isActivatedOn(null, day)).toBe(false)
  })

  it('a list with no appear-from time is always open', () => {
    expect(isChecklistOpen(null, null, day, '06:00')).toBe(true)
  })

  it('a future appear-from time stays hidden', () => {
    expect(isChecklistOpen('15:00', null, day, '09:00')).toBe(false)
    expect(isChecklistHidden('15:00', null, day, '09:00')).toBe(true)
  })

  it('once the appear-from time passes the list opens', () => {
    expect(isChecklistOpen('09:00', null, day, '09:00')).toBe(true)
    expect(isChecklistOpen('09:00', null, day, '12:00')).toBe(true)
  })

  it('activation overrides the time gate for that day only', () => {
    expect(isChecklistOpen('15:00', new Date('2026-10-02T00:00:00.000Z'), day, '09:00')).toBe(true)
    // Next day the same stamp no longer applies.
    expect(isChecklistOpen('15:00', new Date('2026-10-02T00:00:00.000Z'), new Date('2026-10-03T00:00:00.000Z'), '09:00')).toBe(false)
  })
})
