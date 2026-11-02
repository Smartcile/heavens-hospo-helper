import { describe, it, expect } from 'vitest'
import { groupWorkerNotices } from './notice-groups'

const notice = (over: Partial<{ id: string; pinned: boolean; requiresAck: boolean; acked: boolean }> = {}) => ({
  id: over.id ?? 'n',
  pinned: over.pinned ?? false,
  requiresAck: over.requiresAck ?? false,
  acked: over.acked ?? false,
})

describe('groupWorkerNotices', () => {
  it('floats pinned notices to the top even when acknowledged', () => {
    const { pinned, unread, acknowledged } = groupWorkerNotices([
      notice({ id: 'a', requiresAck: true, acked: true }),
      notice({ id: 'p', pinned: true, requiresAck: true, acked: true }),
    ])
    expect(pinned.map((n) => n.id)).toEqual(['p'])
    expect(unread).toEqual([])
    expect(acknowledged.map((n) => n.id)).toEqual(['a'])
  })

  it('sinks acknowledged notices to the bottom group', () => {
    const { unread, acknowledged } = groupWorkerNotices([
      notice({ id: 'x', requiresAck: true, acked: true }),
      notice({ id: 'y' }),
      notice({ id: 'z', requiresAck: true }),
    ])
    expect(unread.map((n) => n.id)).toEqual(['y', 'z'])
    expect(acknowledged.map((n) => n.id)).toEqual(['x'])
  })

  it('keeps notices that do not require acknowledgment in the unread group', () => {
    const { unread, acknowledged } = groupWorkerNotices([notice({ id: 'info' })])
    expect(unread.map((n) => n.id)).toEqual(['info'])
    expect(acknowledged).toEqual([])
  })

  it('handles an empty list', () => {
    expect(groupWorkerNotices([])).toEqual({ pinned: [], unread: [], acknowledged: [] })
  })
})
