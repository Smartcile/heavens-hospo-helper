import { describe, it, expect } from 'vitest'
import {
  NO_POSITION_KEY,
  buildStaffGroups,
  collectPositions,
  groupByPosition,
  insertSubset,
  sortByPinnedAvailability,
  topPositionId,
} from '@/lib/staff-groups'

const POSITIONS = [
  { id: 'mgr', name: 'MANAGER', colour: '#F00' },
  { id: 'sen', name: 'SENIOR', colour: '#0F0' },
  { id: 'bar', name: 'BARISTA', colour: '#00F' },
]

function staff(id: string, positionIds: string[]) {
  return {
    id,
    firstName: id.toUpperCase(),
    lastName: 'X',
    positions: positionIds.map((pid) => ({ id: pid, name: pid.toUpperCase() })),
  }
}

describe('topPositionId', () => {
  it('picks the highest-ranked held position', () => {
    expect(topPositionId([{ id: 'bar' }, { id: 'mgr' }], ['mgr', 'sen', 'bar'])).toBe('mgr')
  })

  it('ignores positions missing from the order', () => {
    expect(topPositionId([{ id: 'ghost' }, { id: 'sen' }], ['mgr', 'sen'])).toBe('sen')
  })

  it('returns null when nothing held is listed', () => {
    expect(topPositionId([{ id: 'ghost' }], ['mgr'])).toBeNull()
    expect(topPositionId([], ['mgr'])).toBeNull()
    expect(topPositionId(undefined, ['mgr'])).toBeNull()
  })
})

describe('buildStaffGroups', () => {
  it('groups by position in the persisted order and omits empty groups', () => {
    const groups = buildStaffGroups(
      [staff('ann', ['bar']), staff('bob', ['sen']), staff('cal', ['bar'])],
      POSITIONS,
    )
    expect(groups.map((g) => g.key)).toEqual(['sen', 'bar'])
    expect(groups[0].items.map((s) => s.id)).toEqual(['bob'])
    expect(groups[1].items.map((s) => s.id)).toEqual(['ann', 'cal'])
  })

  it('places multi-position staff in their highest-ranked group only once', () => {
    const groups = buildStaffGroups([staff('ann', ['bar', 'mgr'])], POSITIONS)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('mgr')
    expect(groups[0].label).toBe('MANAGER')
    expect(groups[0].colour).toBe('#F00')
  })

  it('puts unassigned staff in a trailing NO POSITION group', () => {
    const groups = buildStaffGroups([staff('ann', [])], POSITIONS)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe(NO_POSITION_KEY)
    expect(groups[0].positionId).toBeNull()
    expect(groups[0].items.map((s) => s.id)).toEqual(['ann'])
  })

  it('follows the position array order, not the staff order', () => {
    const groups = buildStaffGroups(
      [staff('ann', ['bar']), staff('bob', ['mgr'])],
      [...POSITIONS].reverse(),
    )
    expect(groups.map((g) => g.key)).toEqual(['bar', 'mgr'])
  })
})

describe('groupByPosition', () => {
  it('groups arbitrary items (clock sessions) by the person’s top position', () => {
    const sessions = [
      { id: 's1', positionIds: ['bar'] },
      { id: 's2', positionIds: ['mgr', 'bar'] },
      { id: 's3', positionIds: ['bar'] },
      { id: 's4', positionIds: undefined },
    ]
    const groups = groupByPosition(sessions, POSITIONS, (s) => s.positionIds)
    expect(groups.map((g) => g.key)).toEqual(['mgr', 'bar', NO_POSITION_KEY])
    expect(groups[0].items.map((s) => s.id)).toEqual(['s2'])
    expect(groups[1].items.map((s) => s.id)).toEqual(['s1', 's3'])
    expect(groups[2].items.map((s) => s.id)).toEqual(['s4'])
  })
})

describe('collectPositions', () => {
  it('derives a de-duplicated position list in encounter order', () => {
    const items = [
      { positions: [{ id: 'bar', name: 'BARISTA', colour: '#00F' }] },
      { positions: [{ id: 'sen', name: 'SENIOR' }, { id: 'bar', name: 'BARISTA' }] },
      { positions: undefined },
    ]
    expect(collectPositions(items, (i) => i.positions)).toEqual([
      { id: 'bar', name: 'BARISTA', colour: '#00F' },
      { id: 'sen', name: 'SENIOR', colour: null },
    ])
  })
})

describe('insertSubset', () => {
  it('drops the reordered subset back into its own slots', () => {
    expect(insertSubset(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], ['d', 'b'])).toEqual([
      'a', 'd', 'c', 'b', 'e',
    ])
  })

  it('keeps the full order when the subset fills it', () => {
    expect(insertSubset(['a', 'b', 'c'], ['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c', 'a', 'b',
    ])
  })

  it('returns the original list on a stale (length mismatch) view', () => {
    const all = ['a', 'b', 'c']
    expect(insertSubset(all, ['a', 'b'], ['b'])).toBe(all)
  })
})

describe('sortByPinnedAvailability', () => {
  it('floats available staff to the front, preserving order within buckets', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const out = sortByPinnedAvailability(rows, (r) => r.id === 'c' || r.id === 'd')
    expect(out.map((r) => r.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('leaves the order untouched when nobody is available', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    expect(sortByPinnedAvailability(rows, () => false).map((r) => r.id)).toEqual(['a', 'b'])
  })
})
