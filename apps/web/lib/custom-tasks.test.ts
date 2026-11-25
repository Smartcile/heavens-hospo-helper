import { describe, it, expect } from 'vitest'
import { isCustomTask, groupCustomTasks, parseDueDate } from '@/lib/custom-tasks'

const base = { id: 't1', isOneOff: false, assignedToStaffId: null as string | null }

describe('isCustomTask', () => {
  it('includes a one-off task', () => {
    expect(isCustomTask({ ...base, isOneOff: true }, { staffId: 'me' })).toBe(true)
  })

  it('includes a task assigned to the viewer, even from another department', () => {
    expect(
      isCustomTask(
        { id: 't2', isOneOff: false, assignedToStaffId: 'me' },
        { staffId: 'me' },
      ),
    ).toBe(true)
  })

  it('excludes a task assigned to somebody else', () => {
    expect(isCustomTask({ ...base, assignedToStaffId: 'other' }, { staffId: 'me' })).toBe(false)
  })

  it('excludes ordinary department tasks', () => {
    expect(isCustomTask(base, { staffId: 'me' })).toBe(false)
  })

  it('never includes a task that lives in a checklist', () => {
    expect(
      isCustomTask({ ...base, isOneOff: true }, { staffId: 'me', checklistTaskIds: new Set(['t1']) }),
    ).toBe(false)
    expect(
      isCustomTask({ id: 't2', isOneOff: false, assignedToStaffId: 'me' }, { staffId: 'me', checklistTaskIds: new Set(['t2']) }),
    ).toBe(false)
  })

  it('admin view treats any assignment as custom', () => {
    expect(isCustomTask({ ...base, assignedToStaffId: 'someone' }, { anyAssignee: true })).toBe(true)
    expect(isCustomTask({ ...base, assignedToStaffId: 'someone' }, { staffId: 'me' })).toBe(false)
  })
})

describe('groupCustomTasks', () => {
  it('groups by department and preserves input order', () => {
    const groups = groupCustomTasks(
      [
        { id: 'a', isOneOff: true, departmentName: 'KITCHEN' },
        { id: 'b', isOneOff: false, assignedToStaffId: 'me', departmentName: 'BAR' },
        { id: 'c', isOneOff: true, departmentName: 'KITCHEN' },
        { id: 'd', isOneOff: false, departmentName: 'BAR' },
      ],
      { staffId: 'me' },
    )

    expect(groups.map((g) => g.name)).toEqual(['KITCHEN', 'BAR'])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['a', 'c'])
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['b'])
  })

  it('drops checklist members and duplicate ids', () => {
    const groups = groupCustomTasks(
      [
        { id: 'a', isOneOff: true, departmentName: 'KITCHEN' },
        { id: 'a', isOneOff: true, departmentName: 'KITCHEN' },
        { id: 'b', isOneOff: true, departmentName: 'KITCHEN' },
      ],
      { checklistTaskIds: new Set(['b']) },
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['a'])
  })

  it('returns an empty list when nothing qualifies', () => {
    expect(groupCustomTasks([{ id: 'a', isOneOff: false }], { staffId: 'me' })).toEqual([])
  })
})

describe('parseDueDate', () => {
  it('accepts a date-only value as a UTC calendar day', () => {
    const parsed = parseDueDate('2026-11-25')
    expect(parsed.ok).toBe(true)
    expect(parsed.value?.toISOString()).toBe('2026-11-25T00:00:00.000Z')
  })

  it('clears an empty or null date', () => {
    expect(parseDueDate('')).toEqual({ ok: true, value: null })
    expect(parseDueDate(null)).toEqual({ ok: true, value: null })
    expect(parseDueDate(undefined)).toEqual({ ok: true, value: null })
  })

  it('rejects a malformed or impossible date', () => {
    expect(parseDueDate('25/11/2026').ok).toBe(false)
    expect(parseDueDate('2026-02-31').ok).toBe(false)
    expect(parseDueDate('2026-13-01').ok).toBe(false)
    expect(parseDueDate(42).ok).toBe(false)
  })
})
