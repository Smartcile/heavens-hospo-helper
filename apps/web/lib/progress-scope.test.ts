import { describe, it, expect } from 'vitest'
import { isManagerRole, progressScope } from './progress-scope'

const OPEN = { id: 'open', taskIds: ['a', 'b'], openNow: true, excludeFromProgress: false }
const CLOSED = { id: 'closed', taskIds: ['c'], openNow: false, excludeFromProgress: false }
const EXCLUDED = { id: 'side', taskIds: ['d'], openNow: true, excludeFromProgress: true }

const TASKS = [
  { id: 'a', isDone: true, isSettled: true },
  { id: 'b', isDone: false, isSettled: false },
  { id: 'c', isDone: false, isSettled: false },
  { id: 'd', isDone: true, isSettled: true },
  { id: 'f', isDone: false, isSettled: false }, // no list at all
]

describe('progressScope', () => {
  it('counts only open lists + no-list work for STAFF', () => {
    const result = progressScope({
      tasks: TASKS,
      checklists: [OPEN, CLOSED, EXCLUDED],
      role: 'STAFF',
      todayKey: '2026-11-27',
    })

    expect(result.scope).toBe('STAFF')
    // a + b (open list) + f (no list). c is in a closed list, d is excluded.
    expect(result.total).toBe(3)
    expect(result.done).toBe(1)
  })

  it('counts the whole day for a manager', () => {
    const result = progressScope({
      tasks: TASKS,
      checklists: [OPEN, CLOSED, EXCLUDED],
      role: 'MANAGER',
      todayKey: '2026-11-27',
    })

    expect(result.scope).toBe('MANAGER')
    // a + b + c + f; d is excluded from progress for everyone.
    expect(result.total).toBe(4)
    expect(result.done).toBe(1)
  })

  it('drops an excluded list for both roles', () => {
    const onlyExcluded = [{ id: 'd', isDone: true, isSettled: true }]
    for (const role of ['STAFF', 'ADMIN']) {
      const result = progressScope({ tasks: onlyExcluded, checklists: [EXCLUDED], role })
      expect(result.total).toBe(0)
      expect(result.done).toBe(0)
    }
  })

  it('still counts a task that also lives in a list that does count', () => {
    const mixed = [
      { id: 'e', isDone: false, isSettled: false },
    ]
    const result = progressScope({
      tasks: mixed,
      checklists: [
        { id: 'side', taskIds: ['e'], openNow: true, excludeFromProgress: true },
        { id: 'open', taskIds: ['e'], openNow: true, excludeFromProgress: false },
      ],
      role: 'STAFF',
    })
    expect(result.total).toBe(1)
  })

  it('keeps settled work in the STAFF denominator after its list closes', () => {
    const tasks = [
      { id: 'c', isDone: false, isSettled: true }, // NOT_REQUIRED on a closed list
      { id: 'x', isDone: false, isSettled: false }, // waiting on the same closed list
    ]
    const result = progressScope({
      tasks,
      checklists: [{ id: 'closed', taskIds: ['c', 'x'], openNow: false }],
      role: 'STAFF',
    })
    // The settled row stays counted; the waiting one does not.
    expect(result.total).toBe(1)
    expect(result.done).toBe(0)
  })

  it('counts only DONE as done — a settled non-DONE stays in the denominator', () => {
    const result = progressScope({
      tasks: [{ id: 'a', isDone: false, isSettled: true }],
      checklists: [{ id: 'open', taskIds: ['a'], openNow: true }],
      role: 'STAFF',
    })
    expect(result.total).toBe(1)
    expect(result.done).toBe(0)
  })

  it('handles an empty day and null role', () => {
    expect(progressScope({ tasks: [], checklists: [], role: null })).toEqual({
      total: 0,
      done: 0,
      scope: 'STAFF',
    })
  })

  it('treats ADMIN and MANAGER as manager roles only', () => {
    expect(isManagerRole('ADMIN')).toBe(true)
    expect(isManagerRole('MANAGER')).toBe(true)
    expect(isManagerRole('STAFF')).toBe(false)
    expect(isManagerRole(null)).toBe(false)
  })
})
