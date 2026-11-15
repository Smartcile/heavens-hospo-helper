import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createTaskLiveHub,
  formatRevisionPart,
  formatTaskRevision,
  hashChecklistTasks,
  type ChecklistTaskRow,
  type TaskLiveRevisionParts,
} from './task-live'

function parts(overrides: Partial<TaskLiveRevisionParts> = {}): TaskLiveRevisionParts {
  return {
    task: { count: 3, maxStamp: '2026-11-15T01:00:00.000Z' },
    completion: { count: 1, maxStamp: '2026-11-15T01:01:00.000Z' },
    progress: { count: 0, maxStamp: null },
    checklist: { count: 2, maxStamp: '2026-11-15T01:02:00.000Z' },
    department: { count: 1, maxStamp: '2026-11-15T01:03:00.000Z' },
    section: { count: 1, maxStamp: '2026-11-15T01:04:00.000Z' },
    checklistTaskHash: 'deadbeef',
    checklistAudience: { count: 1, maxStamp: '2026-11-15T01:05:00.000Z' },
    departmentLink: { count: 0, maxStamp: null },
    ...overrides,
  }
}

const ROWS: ChecklistTaskRow[] = [
  { checklistId: 'c1', taskId: 't1', sortOrder: 0, groupLabel: null },
  { checklistId: 'c1', taskId: 't2', sortOrder: 1, groupLabel: 'OUTSIDE' },
  { checklistId: 'c2', taskId: 't1', sortOrder: 0, groupLabel: null },
]

describe('revision formatting', () => {
  it('formats a part with and without a stamp', () => {
    expect(formatRevisionPart({ count: 0, maxStamp: null })).toBe('0:-')
    expect(formatRevisionPart({ count: 7, maxStamp: '2026-11-15T00:00:00.000Z' })).toBe(
      '7:2026-11-15T00:00:00.000Z',
    )
  })

  it('changes when a count changes', () => {
    expect(formatTaskRevision(parts({ task: { count: 4, maxStamp: parts().task.maxStamp } }))).not.toBe(
      formatTaskRevision(parts()),
    )
  })

  it('changes when a timestamp changes', () => {
    expect(
      formatTaskRevision(
        parts({ completion: { count: 1, maxStamp: '2026-11-15T09:00:00.000Z' } }),
      ),
    ).not.toBe(formatTaskRevision(parts()))
  })

  it('changes when the checklist-task hash changes', () => {
    expect(formatTaskRevision(parts({ checklistTaskHash: 'cafebabe' }))).not.toBe(
      formatTaskRevision(parts()),
    )
  })

  it('produces the same string for identical parts', () => {
    expect(formatTaskRevision(parts())).toBe(formatTaskRevision(parts()))
  })
})

describe('hashChecklistTasks', () => {
  it('is order-independent', () => {
    const shuffled = [ROWS[2], ROWS[0], ROWS[1]]
    expect(hashChecklistTasks(shuffled)).toBe(hashChecklistTasks(ROWS))
  })

  it('is stable across repeated polls with the same rows', () => {
    expect(hashChecklistTasks(ROWS)).toBe(hashChecklistTasks([...ROWS]))
  })

  it('changes when a row is added, removed or edited', () => {
    const base = hashChecklistTasks(ROWS)
    expect(hashChecklistTasks([...ROWS, { checklistId: 'c2', taskId: 't2', sortOrder: 1, groupLabel: null }])).not.toBe(base)
    expect(hashChecklistTasks(ROWS.slice(0, 2))).not.toBe(base)
    expect(hashChecklistTasks([{ ...ROWS[0], sortOrder: 5 }, ...ROWS.slice(1)])).not.toBe(base)
    expect(hashChecklistTasks([{ ...ROWS[0], groupLabel: 'DECK' }, ...ROWS.slice(1)])).not.toBe(base)
  })

  it('hashes an empty set deterministically', () => {
    expect(hashChecklistTasks([])).toBe('811c9dc5')
  })
})

describe('createTaskLiveHub', () => {
  const hubs: ReturnType<typeof createTaskLiveHub>[] = []
  afterEach(() => {
    for (const hub of hubs.splice(0)) hub.dispose()
  })

  function makeHub(revisions: Map<string, string>) {
    const timers = new Map<number, () => void>()
    let nextId = 1
    const compute = vi.fn(async (venueId: string) => revisions.get(venueId) ?? '0')
    const hub = createTaskLiveHub({
      compute,
      setInterval: (fn) => {
        const id = nextId++
        timers.set(id, fn)
        return id
      },
      clearInterval: (handle) => {
        timers.delete(handle as number)
      },
    })
    hubs.push(hub)
    return { hub, compute, timers }
  }

  it('fans out only to the venue whose revision changed', async () => {
    const revisions = new Map([
      ['v1', 'a'],
      ['v2', 'b'],
    ])
    const { hub } = makeHub(revisions)
    const v1 = vi.fn()
    const v2 = vi.fn()

    hub.subscribe('v1', v1)
    hub.subscribe('v2', v2)

    // First tick records each baseline without notifying.
    await hub.tick('v1')
    await hub.tick('v2')
    expect(v1).not.toHaveBeenCalled()
    expect(v2).not.toHaveBeenCalled()

    revisions.set('v1', 'a2')
    await hub.tick('v1')
    await hub.tick('v2')

    expect(v1).toHaveBeenCalledTimes(1); expect(v1).toHaveBeenCalledWith('a2')
    expect(v2).not.toHaveBeenCalled()
  })

  it('sends no event on an unchanged tick', async () => {
    const revisions = new Map([['v1', 'a']])
    const { hub } = makeHub(revisions)
    const subscriber = vi.fn()

    hub.subscribe('v1', subscriber)
    await hub.tick('v1') // baseline
    await hub.tick('v1') // unchanged

    expect(subscriber).not.toHaveBeenCalled()
  })

  it('stops the timer when the last subscriber leaves', () => {
    const { hub, timers } = makeHub(new Map([['v1', 'a']]))

    const off1 = hub.subscribe('v1', vi.fn())
    const off2 = hub.subscribe('v1', vi.fn())
    expect(hub.hasTimer('v1')).toBe(true)
    expect(timers.size).toBe(1)

    off1()
    expect(hub.hasTimer('v1')).toBe(true)

    off2()
    expect(hub.hasTimer('v1')).toBe(false)
    expect(hub.subscriberCount('v1')).toBe(0)
    expect(timers.size).toBe(0)
  })

  it('delivers the next change to a late subscriber without replaying the baseline', async () => {
    const revisions = new Map([['v1', 'a']])
    const { hub } = makeHub(revisions)
    const early = vi.fn()
    const late = vi.fn()

    hub.subscribe('v1', early)
    await hub.tick('v1')
    expect(early).not.toHaveBeenCalled()

    hub.subscribe('v1', late)
    expect(late).not.toHaveBeenCalled()

    revisions.set('v1', 'a2')
    await hub.tick('v1')

    expect(early).toHaveBeenCalledTimes(1); expect(early).toHaveBeenCalledWith('a2')
    expect(late).toHaveBeenCalledTimes(1); expect(late).toHaveBeenCalledWith('a2')
  })

  it('survives a compute failure and retries on the next tick', async () => {
    const revisions = new Map([['v1', 'a']])
    const compute = vi
      .fn<(venueId: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue('a')
    const onError = vi.fn()
    const hub = createTaskLiveHub({
      compute,
      onError,
      setInterval: () => 1,
      clearInterval: () => {},
    })
    hubs.push(hub)
    const subscriber = vi.fn()

    hub.subscribe('v1', subscriber)
    await hub.tick('v1')
    expect(onError).toHaveBeenCalledTimes(1)

    await hub.tick('v1')
    revisions.set('v1', 'a2')
    compute.mockResolvedValue('a2')
    await hub.tick('v1')

    expect(subscriber).toHaveBeenCalledTimes(1); expect(subscriber).toHaveBeenCalledWith('a2')
  })
})
