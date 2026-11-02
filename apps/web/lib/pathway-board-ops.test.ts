import { describe, it, expect } from 'vitest'
import { reorderWithinStage, shiftStage, deleteNodeAndEdges, STAGE_X } from '@/lib/pathway-board-ops'

const n = (id: string, stage: number, x: number, y: number) => ({ id, stage, x, y })

const SAMPLE = [
  n('a', 0, 60, 60),
  n('b', 0, 60, 150),
  n('c', 0, 60, 240),
  n('m', 1, 320, 60),
]

describe('reorderWithinStage', () => {
  it('moves a node up within its stage, swapping array order AND y', () => {
    const next = reorderWithinStage(SAMPLE, 'b', -1)
    expect(next.map((x) => x.id)).toEqual(['b', 'a', 'c', 'm'])
    expect(next[0].y).toBe(60) // b took a's y
    expect(next[1].y).toBe(150) // a took b's y
    expect(next.find((x) => x.id === 'c')!.y).toBe(240)
  })

  it('moves a node down within its stage', () => {
    const next = reorderWithinStage(SAMPLE, 'a', 1)
    expect(next.map((x) => x.id)).toEqual(['b', 'a', 'c', 'm'])
    expect(next[0].y).toBe(60) // b took a's old spot
    expect(next[1].y).toBe(150) // a took b's spot
  })

  it('does nothing at the stage edges', () => {
    expect(reorderWithinStage(SAMPLE, 'a', -1)).toBe(SAMPLE)
    expect(reorderWithinStage(SAMPLE, 'c', 1)).toBe(SAMPLE)
  })

  it('never crosses stage boundaries', () => {
    const next = reorderWithinStage(SAMPLE, 'c', 1)
    expect(next.map((x) => x.id)).toEqual(['a', 'b', 'c', 'm'])
  })

  it('no-ops for an unknown id', () => {
    expect(reorderWithinStage(SAMPLE, 'zzz', -1)).toBe(SAMPLE)
  })
})

describe('shiftStage', () => {
  it('moves a node to the next stage and snaps x to that column', () => {
    const next = shiftStage(SAMPLE, 'a', 1)
    const a = next.find((x) => x.id === 'a')!
    expect(a.stage).toBe(1)
    expect(a.x).toBe(60 + 1 * STAGE_X)
    expect(a.y).toBe(60) // y untouched
  })

  it('moves a node up a stage', () => {
    const next = shiftStage(SAMPLE, 'm', -1)
    const m = next.find((x) => x.id === 'm')!
    expect(m.stage).toBe(0)
    expect(m.x).toBe(60)
  })

  it('clamps at stage 0', () => {
    const next = shiftStage(SAMPLE, 'a', -1)
    expect(next.find((x) => x.id === 'a')!.stage).toBe(0)
  })

  it('leaves every other node untouched', () => {
    const next = shiftStage(SAMPLE, 'a', 1)
    const b = next.find((x) => x.id === 'b')!
    expect(b).toEqual(SAMPLE.find((x) => x.id === 'b'))
  })
})

describe('deleteNodeAndEdges', () => {
  it('removes the node and every edge touching it', () => {
    const edges = [
      { fromNodeId: 'a', toNodeId: 'm' },
      { fromNodeId: 'b', toNodeId: 'm' },
      { fromNodeId: 'c', toNodeId: 'b' },
    ]
    const { nodes, edges: nextEdges } = deleteNodeAndEdges(SAMPLE, edges, 'b')
    expect(nodes.map((x) => x.id)).toEqual(['a', 'c', 'm'])
    expect(nextEdges).toEqual([{ fromNodeId: 'a', toNodeId: 'm' }])
  })
})
