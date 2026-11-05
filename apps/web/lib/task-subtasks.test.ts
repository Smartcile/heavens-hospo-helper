import { describe, it, expect } from 'vitest'
import {
  validateParentTask,
  availableParentTasks,
  orderTasksWithChildren,
  subtasksOutsideList,
} from '@/lib/task-subtasks'

describe('validateParentTask', () => {
  const parent = { id: 'p1', venueId: 'v1', parentTaskId: null }

  it('accepts a valid same-venue top-level parent', () => {
    expect(validateParentTask({ taskVenueId: 'v1', parent })).toBeNull()
  })

  it('accepts clearing the parent', () => {
    expect(validateParentTask({ taskVenueId: 'v1', parent: null })).toBeNull()
  })

  it('rejects a task as its own parent', () => {
    expect(
      validateParentTask({ taskId: 'p1', taskVenueId: 'v1', parent }),
    ).toBe('A TASK CANNOT BE ITS OWN PARENT')
  })

  it('rejects a parent in another venue', () => {
    expect(
      validateParentTask({ taskVenueId: 'v2', parent }),
    ).toBe('PARENT TASK MUST BE IN THE SAME VENUE')
  })

  it('rejects a parent that is already a subtask (depth > 1)', () => {
    expect(
      validateParentTask({
        taskVenueId: 'v1',
        parent: { id: 'p2', venueId: 'v1', parentTaskId: 'p1' },
      }),
    ).toBe('SUBTASKS CANNOT HAVE THEIR OWN SUBTASKS')
  })

  it('rejects giving a parent to a task that already has children', () => {
    expect(
      validateParentTask({ taskVenueId: 'v1', childHasSubtasks: true, parent }),
    ).toBe('A TASK WITH SUBTASKS CANNOT BECOME A SUBTASK')
  })

  it('reports a missing parent', () => {
    expect(
      validateParentTask({ taskVenueId: 'v1', parentExists: false, parent }),
    ).toBe('PARENT TASK NOT FOUND')
  })
})

describe('availableParentTasks', () => {
  const tasks = [
    { id: 't1', title: 'PARENT', venueId: 'v1', parentTaskId: null },
    { id: 't2', title: 'CHILD', venueId: 'v1', parentTaskId: 't1' },
    { id: 't3', title: 'OTHER VENUE', venueId: 'v2', parentTaskId: null },
  ]

  it('only offers top-level tasks in the same venue and never itself', () => {
    expect(availableParentTasks(tasks, { venueId: 'v1', taskId: 't1' }).map((t) => t.id)).toEqual([])
    expect(availableParentTasks(tasks, { venueId: 'v1' }).map((t) => t.id)).toEqual(['t1'])
    expect(availableParentTasks(tasks, { venueId: 'v2' }).map((t) => t.id)).toEqual(['t3'])
  })
})

describe('orderTasksWithChildren', () => {
  it('puts children directly after their parent with depth 1', () => {
    const rows = orderTasksWithChildren([
      { id: 'c1', parentTaskId: 'p1' },
      { id: 'other', parentTaskId: null },
      { id: 'p1', parentTaskId: null },
    ])
    // Root order follows the input; a child immediately follows its parent.
    expect(rows.map((r) => r.task.id)).toEqual(['other', 'p1', 'c1'])
    expect(rows.find((r) => r.task.id === 'c1')?.depth).toBe(1)
    expect(rows.find((r) => r.task.id === 'p1')?.depth).toBe(0)
  })

  it('keeps a child whose parent is outside the set', () => {
    const rows = orderTasksWithChildren([{ id: 'c1', parentTaskId: 'p9' }])
    expect(rows.map((r) => r.task.id)).toEqual(['c1'])
    expect(rows[0].depth).toBe(0)
  })
})

describe('subtasksOutsideList', () => {
  it('returns subtask ids that are not in the same list', () => {
    expect(subtasksOutsideList(['c1', 'c2'], ['c1'])).toEqual(['c2'])
    expect(subtasksOutsideList(['c1'], ['c1', 'c2'])).toEqual([])
  })
})
