import { describe, it, expect } from 'vitest'
import {
  describeHourTargets,
  hourGoals,
  hourStatusTone,
  hourTargetStatus,
  parseHourTarget,
} from '@/lib/roster-hours'

describe('hourGoals', () => {
  it('keeps configured positive targets in min → wanted → target order', () => {
    expect(hourGoals({ minHoursPerWeek: 20, wantedHoursPerWeek: 30, targetHoursPerWeek: 40 })).toEqual([
      { kind: 'min', hours: 20 },
      { kind: 'wanted', hours: 30 },
      { kind: 'target', hours: 40 },
    ])
  })

  it('ignores null, zero and negative targets', () => {
    expect(hourGoals({ minHoursPerWeek: null, wantedHoursPerWeek: 0, targetHoursPerWeek: 38 })).toEqual([
      { kind: 'target', hours: 38 },
    ])
  })
})

describe('hourTargetStatus', () => {
  it('returns none when no targets are configured', () => {
    const s = hourTargetStatus(32, {})
    expect(s.level).toBe('none')
    expect(s.goals).toEqual([])
    expect(s.label).toBe('32H SCHEDULED')
  })

  it('flags under the contractual minimum in red', () => {
    const s = hourTargetStatus(18, { minHoursPerWeek: 20, targetHoursPerWeek: 40 })
    expect(s.level).toBe('under-min')
    expect(s.unmet[0]).toEqual({ kind: 'min', hours: 20 })
    expect(s.label).toBe('18H · 2H UNDER MIN')
  })

  it('warns below a soft goal once the minimum is met', () => {
    const s = hourTargetStatus(25, { minHoursPerWeek: 20, wantedHoursPerWeek: 30, targetHoursPerWeek: 38 })
    expect(s.level).toBe('under-goal')
    expect(s.label).toBe('25H · 5H UNDER WANTED')
  })

  it('reports the highest goal as the headline bar', () => {
    const s = hourTargetStatus(32, { minHoursPerWeek: 20, targetHoursPerWeek: 32 })
    expect(s.level).toBe('met')
    expect(s.goal).toEqual({ kind: 'target', hours: 32 })
  })

  it('reports over the highest goal', () => {
    const s = hourTargetStatus(45, { minHoursPerWeek: 20, targetHoursPerWeek: 40 })
    expect(s.level).toBe('over')
    expect(s.label).toBe('45H · 5H OVER TARGET')
  })

  it('handles a minimum-only target', () => {
    expect(hourTargetStatus(20, { minHoursPerWeek: 20 }).level).toBe('met')
    expect(hourTargetStatus(21, { minHoursPerWeek: 20 }).level).toBe('over')
  })
})

describe('describeHourTargets', () => {
  it('renders a compact goal line', () => {
    expect(describeHourTargets({ minHoursPerWeek: 20, wantedHoursPerWeek: 30.5, targetHoursPerWeek: 40 }))
      .toBe('MIN 20H · WANTED 30.5H · TARGET 40H')
    expect(describeHourTargets({})).toBe('')
  })
})

describe('parseHourTarget', () => {
  it('accepts finite non-negative numbers and blanks', () => {
    expect(parseHourTarget(20)).toEqual({ ok: true, value: 20 })
    expect(parseHourTarget('30.5')).toEqual({ ok: true, value: 30.5 })
    expect(parseHourTarget(null)).toEqual({ ok: true, value: null })
    expect(parseHourTarget('')).toEqual({ ok: true, value: null })
  })

  it('rejects negative, non-finite and non-numeric targets', () => {
    expect(parseHourTarget(-1)).toEqual({ ok: false, value: null })
    expect(parseHourTarget('abc')).toEqual({ ok: false, value: null })
    expect(parseHourTarget(Number.POSITIVE_INFINITY)).toEqual({ ok: false, value: null })
  })
})

describe('hourStatusTone', () => {
  it('maps levels to the roster palette', () => {
    expect(hourStatusTone('under-min')).toContain('danger')
    expect(hourStatusTone('under-goal')).toContain('warning')
    expect(hourStatusTone('met')).toContain('success')
    expect(hourStatusTone('none')).toContain('grey')
  })
})
