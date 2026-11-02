import { describe, it, expect } from 'vitest'
import {
  resolveWorkerTaskAccess,
  EMPTY_WORKER_TASK_ACCESS,
  FULL_WORKER_TASK_ACCESS,
} from '@/lib/worker-task-access'

describe('resolveWorkerTaskAccess', () => {
  it('lets ADMIN and MANAGER author everything', () => {
    expect(resolveWorkerTaskAccess('ADMIN', [])).toEqual(FULL_WORKER_TASK_ACCESS)
    expect(resolveWorkerTaskAccess('MANAGER', [])).toEqual(FULL_WORKER_TASK_ACCESS)
  })

  it('gives a STAFF member with no grants nothing', () => {
    expect(resolveWorkerTaskAccess('STAFF', [])).toEqual(EMPTY_WORKER_TASK_ACCESS)
  })

  it('maps a create grant to task create and list create (OR mapping)', () => {
    const access = resolveWorkerTaskAccess('STAFF', ['execution.tasks.create'])
    expect(access.canCreateTask).toBe(true)
    expect(access.canCreateList).toBe(true)
    expect(access.canEditTask).toBe(false)
    expect(access.canEditList).toBe(false)
  })

  it('maps an edit grant to task edit and list create/edit', () => {
    const access = resolveWorkerTaskAccess('STAFF', ['execution.tasks.edit'])
    expect(access.canEditTask).toBe(true)
    expect(access.canEditList).toBe(true)
    // Product approved CREATE OR EDIT for list creation.
    expect(access.canCreateList).toBe(true)
    expect(access.canCreateTask).toBe(false)
    expect(access.canDeleteTask).toBe(false)
  })

  it('maps a delete grant to task/list delete and counts as authoring', () => {
    const access = resolveWorkerTaskAccess('STAFF', ['execution.tasks.delete'])
    expect(access.canDeleteTask).toBe(true)
    expect(access.canDeleteList).toBe(true)
    expect(access.canAuthor).toBe(true)
  })

  it('ignores unrelated grants', () => {
    expect(resolveWorkerTaskAccess('STAFF', ['training.playbook.edit'])).toEqual(
      EMPTY_WORKER_TASK_ACCESS,
    )
  })
})
