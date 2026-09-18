import { describe, it, expect } from 'vitest'
import { BEO_BLOCKS } from '@/lib/beo-blocks'
import { decorateLibrary } from '@/lib/beo-links'
import { buildEventFlow, configIsEmpty } from '@/lib/event-flow'

const LIB = decorateLibrary(BEO_BLOCKS, [
  { blockType: 'DIETARY', kind: 'TASK', targetId: 't1' },
  { blockType: 'ROOM_SETUP', kind: 'CHECKLIST', targetId: 'c1' },
])

describe('configIsEmpty', () => {
  it('treats blank strings, empty arrays and zero as empty', () => {
    expect(configIsEmpty({})).toBe(true)
    expect(configIsEmpty({ text: '  ', items: [] })).toBe(true)
    expect(configIsEmpty({ limit: 0 })).toBe(true)
  })

  it('treats content as non-empty', () => {
    expect(configIsEmpty({ text: 'HI' })).toBe(false)
    expect(configIsEmpty({ items: [{ qty: 1 }] })).toBe(false)
    expect(configIsEmpty({ limit: 5 })).toBe(false)
  })
})

describe('buildEventFlow', () => {
  const BLOCKS = [
    { id: 'a', type: 'DIETARY', title: null, config: { rows: [] } },
    { id: 'b', type: 'TIMELINE', title: null, config: { rows: [{ time: '18:00', label: 'MAINS' }] } },
    { id: 'r', type: 'ROOM_SETUP', title: null, config: { layoutNotes: 'ROUNDS' } },
    { id: 'c', type: 'HISTORY', title: null, config: {} },
  ]

  it('builds planning areas, prep items and event-day moments', () => {
    const flow = buildEventFlow({ blocks: BLOCKS, library: LIB, names: { t1: 'COOK', c1: 'SETUP' } })
    const [planning, prep, eventDay] = flow.stages

    expect(planning.nodes.map((n) => n.label)).toEqual(['DIETARY REQUIREMENTS', 'RUN SHEET', 'ROOM SETUP'])
    expect(planning.nodes.map((n) => n.filled)).toEqual([false, true, true])

    expect(prep.nodes.map((n) => n.label)).toEqual(['COOK', 'SETUP'])
    expect(prep.nodes.map((n) => n.kind)).toEqual(['TASK', 'CHECKLIST'])

    expect(eventDay.nodes).toHaveLength(1)
    expect(eventDay.nodes[0].label).toBe('MAINS')
    expect(eventDay.nodes[0].detail).toBe('18:00')

    expect(flow.areasTotal).toBe(3)
    expect(flow.areasFilled).toBe(2)
  })

  it('never puts the read-only HISTORY block in planning', () => {
    const flow = buildEventFlow({ blocks: BLOCKS, library: LIB })
    expect(flow.stages[0].nodes.find((n) => n.label === 'HISTORY')).toBeUndefined()
  })

  it('dedupes the same linked task across areas', () => {
    const blocks = [
      { id: 'a', type: 'DIETARY', title: null, config: {} },
      { id: 'd', type: 'DIETARY', title: 'SECOND', config: {} },
    ]
    const flow = buildEventFlow({ blocks, library: LIB })
    expect(flow.stages[1].nodes.filter((n) => n.id === 'task-t1')).toHaveLength(1)
  })

  it('falls back to a generic label when names are absent', () => {
    const flow = buildEventFlow({ blocks: BLOCKS, library: LIB })
    expect(flow.stages[1].nodes.map((n) => n.label)).toEqual(['TASK', 'CHECKLIST'])
  })
})
