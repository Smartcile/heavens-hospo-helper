import { describe, it, expect } from 'vitest'
import {
  groupTargetIdsByKind,
  attachTargets,
  targetKey,
  type StepLinkRow,
  type LinkTarget,
} from './guide-links'

function link(over: Partial<StepLinkRow> = {}): StepLinkRow {
  return { id: 'l1', kind: 'ITEM', targetId: 't1', qty: null, note: null, order: 0, ...over }
}

function target(over: Partial<LinkTarget> = {}): LinkTarget {
  return { id: 't1', label: 'T20 TORX', sub: null, imageUrl: null, missing: false, ...over }
}

describe('groupTargetIdsByKind', () => {
  it('returns nothing for no links', () => {
    expect(groupTargetIdsByKind([])).toEqual({})
  })

  it('groups ids under their kind', () => {
    const links = [
      link({ id: 'l1', kind: 'ITEM', targetId: 'i1' }),
      link({ id: 'l2', kind: 'TASK', targetId: 'k1' }),
      link({ id: 'l3', kind: 'ITEM', targetId: 'i2' }),
    ]
    expect(groupTargetIdsByKind(links)).toEqual({ ITEM: ['i1', 'i2'], TASK: ['k1'] })
  })

  // This is what keeps the query count flat: ten steps referencing the same
  // spanner must still produce one id, not ten.
  it('de-duplicates repeated targets within a kind', () => {
    const links = [
      link({ id: 'l1', kind: 'ITEM', targetId: 'i1' }),
      link({ id: 'l2', kind: 'ITEM', targetId: 'i1' }),
      link({ id: 'l3', kind: 'ITEM', targetId: 'i1' }),
    ]
    expect(groupTargetIdsByKind(links)).toEqual({ ITEM: ['i1'] })
  })

  it('keeps the same id separate across different kinds', () => {
    const links = [
      link({ id: 'l1', kind: 'ITEM', targetId: 'x' }),
      link({ id: 'l2', kind: 'SECTION', targetId: 'x' }),
    ]
    expect(groupTargetIdsByKind(links)).toEqual({ ITEM: ['x'], SECTION: ['x'] })
  })

  it('never emits a kind with no links', () => {
    const grouped = groupTargetIdsByKind([link({ kind: 'GUIDE' })])
    expect(Object.keys(grouped)).toEqual(['GUIDE'])
  })
})

describe('targetKey', () => {
  it('namespaces the id by kind so kinds cannot collide', () => {
    expect(targetKey('ITEM', 'x')).not.toBe(targetKey('SECTION', 'x'))
  })
})

describe('attachTargets', () => {
  it('attaches a resolved target', () => {
    const links = [link({ kind: 'ITEM', targetId: 'i1' })]
    const index = new Map([[targetKey('ITEM', 'i1'), target({ id: 'i1' })]])
    const out = attachTargets(links, index)
    expect(out[0].target.label).toBe('T20 TORX')
    expect(out[0].target.missing).toBe(false)
  })

  // The trade-off of a polymorphic targetId: nothing stops the row being
  // deleted. It must render as removed, not throw.
  it('marks a vanished target as missing instead of throwing', () => {
    const links = [link({ kind: 'ITEM', targetId: 'gone' })]
    const out = attachTargets(links, new Map())
    expect(out[0].target.missing).toBe(true)
    expect(out[0].target.label).toBe('ITEM REMOVED')
    expect(out[0].target.id).toBe('gone')
  })

  it('uses a kind-appropriate label when missing', () => {
    const out = attachTargets([link({ kind: 'CHECKLIST', targetId: 'gone' })], new Map())
    expect(out[0].target.label).toBe('CHECKLIST REMOVED')
  })

  it('does not match a target indexed under a different kind', () => {
    const links = [link({ kind: 'SECTION', targetId: 'x' })]
    const index = new Map([[targetKey('ITEM', 'x'), target({ id: 'x' })]])
    expect(attachTargets(links, index)[0].target.missing).toBe(true)
  })

  it('sorts by order', () => {
    const links = [
      link({ id: 'b', targetId: 'i2', order: 2 }),
      link({ id: 'a', targetId: 'i1', order: 0 }),
      link({ id: 'c', targetId: 'i3', order: 1 }),
    ]
    expect(attachTargets(links, new Map()).map((l) => l.id)).toEqual(['a', 'c', 'b'])
  })

  it('does not mutate the input array', () => {
    const links = [link({ id: 'b', order: 2 }), link({ id: 'a', order: 0 })]
    attachTargets(links, new Map())
    expect(links.map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('preserves qty and note', () => {
    const links = [link({ qty: 2, note: 'TOP SHELF' })]
    const out = attachTargets(links, new Map())
    expect(out[0].qty).toBe(2)
    expect(out[0].note).toBe('TOP SHELF')
  })

  it('returns nothing for no links', () => {
    expect(attachTargets([], new Map())).toEqual([])
  })
})
