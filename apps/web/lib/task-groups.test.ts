import { describe, expect, it } from 'vitest'
import {
  groupChecklistTasks,
  groupLabels,
  normaliseGroupLabel,
  parseTaskGroups,
  planBulkNotRequired,
  type BulkGroupCandidate,
} from '@/lib/task-groups'

describe('normaliseGroupLabel', () => {
  it('trims, collapses whitespace and uppercases', () => {
    expect(normaliseGroupLabel('  outside   deck ')).toBe('OUTSIDE DECK')
  })

  it('caps very long labels', () => {
    expect(normaliseGroupLabel('x'.repeat(80))).toHaveLength(40)
  })

  it('treats blanks and non-strings as no group', () => {
    expect(normaliseGroupLabel('')).toBeNull()
    expect(normaliseGroupLabel('   ')).toBeNull()
    expect(normaliseGroupLabel(null)).toBeNull()
    expect(normaliseGroupLabel(undefined)).toBeNull()
    expect(normaliseGroupLabel(42)).toBeNull()
  })
})

describe('groupChecklistTasks', () => {
  const tasks = [
    { id: 'a', groupLabel: 'OUTSIDE' },
    { id: 'b', groupLabel: null },
    { id: 'c', groupLabel: 'outside' },
    { id: 'd', groupLabel: ' bar ' },
    { id: 'e' },
  ]

  it('merges labels after normalising and preserves task order', () => {
    expect(groupChecklistTasks(tasks)).toEqual([
      { label: null, tasks: [{ id: 'b', groupLabel: null }, { id: 'e' }] },
      { label: 'OUTSIDE', tasks: [{ id: 'a', groupLabel: 'OUTSIDE' }, { id: 'c', groupLabel: 'outside' }] },
      { label: 'BAR', tasks: [{ id: 'd', groupLabel: ' bar ' }] },
    ])
  })

  it('returns only groups when every task is grouped', () => {
    expect(groupChecklistTasks([{ id: 'a', groupLabel: 'OUTSIDE' }])).toEqual([
      { label: 'OUTSIDE', tasks: [{ id: 'a', groupLabel: 'OUTSIDE' }] },
    ])
  })

  it('returns nothing for an empty list', () => {
    expect(groupChecklistTasks([])).toEqual([])
  })
})

describe('groupLabels', () => {
  it('lists distinct normalised labels in first-seen order', () => {
    expect(
      groupLabels([
        { id: 'a', groupLabel: 'outside' },
        { id: 'b', groupLabel: 'BAR' },
        { id: 'c', groupLabel: ' OUTSIDE ' },
        { id: 'd' },
      ]),
    ).toEqual(['OUTSIDE', 'BAR'])
  })
})

describe('parseTaskGroups', () => {
  it('normalises string labels and ignores unknown shapes', () => {
    expect(parseTaskGroups({ t1: ' outside ', t2: '', t3: 42 })).toEqual({
      t1: 'OUTSIDE',
      t2: null,
    })
  })

  it('returns an empty map for a malformed payload', () => {
    expect(parseTaskGroups(null)).toEqual({})
    expect(parseTaskGroups([])).toEqual({})
    expect(parseTaskGroups('x')).toEqual({})
  })
})

describe('planBulkNotRequired', () => {
  const base: BulkGroupCandidate = {
    taskId: 't1',
    isSettled: false,
    visibleToday: true,
    allowsNotRequired: true,
    requireReason: false,
  }

  it('settles every eligible task and reports no skips', () => {
    expect(planBulkNotRequired([base, { ...base, taskId: 't2' }])).toEqual({
      eligible: ['t1', 't2'],
      skipped: [],
      requiresNote: false,
      reasonMissing: false,
    })
  })

  it('skips settled, off-schedule and disallowed tasks in precedence order', () => {
    const plan = planBulkNotRequired([
      { ...base, taskId: 'settled', isSettled: true, visibleToday: false, allowsNotRequired: false },
      { ...base, taskId: 'off', visibleToday: false, allowsNotRequired: false },
      { ...base, taskId: 'blocked', allowsNotRequired: false },
      base,
    ])
    expect(plan.eligible).toEqual(['t1'])
    expect(plan.skipped).toEqual([
      { taskId: 'settled', reason: 'ALREADY SETTLED' },
      { taskId: 'off', reason: 'NOT DUE TODAY' },
      { taskId: 'blocked', reason: 'NOT REQUIRED NOT AVAILABLE' },
    ])
  })

  it('requires a note when any eligible task requires a reason', () => {
    const plan = planBulkNotRequired([{ ...base, requireReason: true }])
    expect(plan.requiresNote).toBe(true)
    expect(plan.reasonMissing).toBe(true)
  })

  it('accepts a whitespace-trimmed note when one is required', () => {
    const plan = planBulkNotRequired([{ ...base, requireReason: true }], '  RAIN  ')
    expect(plan.requiresNote).toBe(true)
    expect(plan.reasonMissing).toBe(false)
  })
})
