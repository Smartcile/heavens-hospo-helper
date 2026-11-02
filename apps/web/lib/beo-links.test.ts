import { describe, it, expect } from 'vitest'
import { BEO_BLOCKS, blockDef, type BeoBlockDef } from '@/lib/beo-blocks'
import {
  groupLinksByBlock,
  decorateLibrary,
  linkIdsFor,
  linkKindLabel,
} from '@/lib/beo-links'

const LINKS = [
  { blockType: 'DIETARY', kind: 'GUIDE', targetId: 'g1', sortOrder: 0 },
  { blockType: 'DIETARY', kind: 'GUIDE', targetId: 'g2', sortOrder: 1 },
  { blockType: 'DIETARY', kind: 'TASK', targetId: 't1', sortOrder: 0 },
  { blockType: 'BAR_TAB', kind: 'CHECKLIST', targetId: 'c1', sortOrder: 0 },
]

describe('groupLinksByBlock', () => {
  it('splits each block type into guide/task/checklist ids', () => {
    const map = groupLinksByBlock(LINKS)
    expect(map.get('DIETARY')).toEqual({ guideIds: ['g1', 'g2'], taskIds: ['t1'], checklistIds: [] })
    expect(map.get('BAR_TAB')).toEqual({ guideIds: [], taskIds: [], checklistIds: ['c1'] })
  })

  it('dedupes and ignores blank rows', () => {
    const map = groupLinksByBlock([
      { blockType: 'DIETARY', kind: 'GUIDE', targetId: 'g1' },
      { blockType: 'DIETARY', kind: 'GUIDE', targetId: 'g1' },
      { blockType: '', kind: 'GUIDE', targetId: 'g9' },
      { blockType: 'DIETARY', kind: 'GUIDE', targetId: '' },
    ])
    expect(map.get('DIETARY')?.guideIds).toEqual(['g1'])
    expect(map.size).toBe(1)
  })

  it('orders by sortOrder', () => {
    const map = groupLinksByBlock([
      { blockType: 'X', kind: 'TASK', targetId: 'b', sortOrder: 2 },
      { blockType: 'X', kind: 'TASK', targetId: 'a', sortOrder: 1 },
    ])
    expect(map.get('X')?.taskIds).toEqual(['a', 'b'])
  })
})

describe('decorateLibrary', () => {
  it('attaches link sets to matching built-in and custom defs', () => {
    const custom: BeoBlockDef = {
      type: 'BAR_TAB',
      label: 'BAR TAB',
      group: 'CUSTOM',
      description: '',
      defaultConfig: {},
      fields: [],
    }
    const lib = [...BEO_BLOCKS, custom]
    const decorated = decorateLibrary(lib, LINKS)
    expect(blockDef('DIETARY', decorated)?.guideIds).toEqual(['g1', 'g2'])
    expect(blockDef('DIETARY', decorated)?.taskIds).toEqual(['t1'])
    expect(blockDef('BAR_TAB', decorated)?.checklistIds).toEqual(['c1'])
  })

  it('returns the same library when there are no links', () => {
    expect(decorateLibrary(BEO_BLOCKS, [])).toBe(BEO_BLOCKS)
  })

  it('leaves a def with no links untouched', () => {
    const decorated = decorateLibrary(BEO_BLOCKS, LINKS)
    expect(blockDef('NOTES', decorated)?.guideIds).toBeUndefined()
  })
})

describe('linkIdsFor / linkKindLabel', () => {
  it('reads the right id list off a def', () => {
    const def: BeoBlockDef = {
      type: 'X',
      label: 'X',
      group: 'CUSTOM',
      description: '',
      defaultConfig: {},
      fields: [],
      guideIds: ['g1'],
      taskIds: ['t1'],
      checklistIds: ['c1'],
    }
    expect(linkIdsFor(def, 'GUIDE')).toEqual(['g1'])
    expect(linkIdsFor(def, 'TASK')).toEqual(['t1'])
    expect(linkIdsFor(def, 'CHECKLIST')).toEqual(['c1'])
    expect(linkIdsFor(undefined, 'GUIDE')).toEqual([])
  })

  it('labels a kind and passes an unknown one through', () => {
    expect(linkKindLabel('GUIDE')).toBe('GUIDE')
    expect(linkKindLabel('WEIRD')).toBe('WEIRD')
  })
})
