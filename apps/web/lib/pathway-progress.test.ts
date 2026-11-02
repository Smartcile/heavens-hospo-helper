import { describe, it, expect } from 'vitest'
import {
  resolvePathwayProgress,
  findPathwayCycle,
  levelForPoints,
  nextLevelThreshold,
  type ProgressNode,
  type ProgressEdge,
} from './pathway-progress'

function n(id: string, over: Partial<ProgressNode> = {}): ProgressNode {
  return { id, kind: 'GUIDE', points: 10, ...over }
}
const e = (fromNodeId: string, toNodeId: string): ProgressEdge => ({ fromNodeId, toNodeId })

function statusOf(res: ReturnType<typeof resolvePathwayProgress>, id: string) {
  return res.nodes.find((x) => x.id === id)?.status
}

describe('resolvePathwayProgress', () => {
  it('handles an empty pathway', () => {
    const res = resolvePathwayProgress([], [], new Set())
    expect(res.nodes).toEqual([])
    expect(res.totalPoints).toBe(0)
    expect(res.earnedPoints).toBe(0)
    expect(res.level).toBe(1)
  })

  it('makes a node with no prerequisites AVAILABLE', () => {
    const res = resolvePathwayProgress([n('a')], [], new Set())
    expect(statusOf(res, 'a')).toBe('AVAILABLE')
  })

  it('locks a node whose prerequisite is not done', () => {
    const res = resolvePathwayProgress([n('a'), n('b')], [e('a', 'b')], new Set())
    expect(statusOf(res, 'a')).toBe('AVAILABLE')
    expect(statusOf(res, 'b')).toBe('LOCKED')
    expect(res.nodes.find((x) => x.id === 'b')!.blockedBy).toEqual(['a'])
  })

  it('unlocks the next node once its prerequisite is done', () => {
    const res = resolvePathwayProgress([n('a'), n('b')], [e('a', 'b')], new Set(['a']))
    expect(statusOf(res, 'a')).toBe('DONE')
    expect(statusOf(res, 'b')).toBe('AVAILABLE')
    expect(res.nodes.find((x) => x.id === 'b')!.blockedBy).toEqual([])
  })

  it('requires every prerequisite, not just one (diamond)', () => {
    const nodes = [n('a'), n('b'), n('c'), n('d')]
    const edges = [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd')]

    const partial = resolvePathwayProgress(nodes, edges, new Set(['a', 'b']))
    expect(statusOf(partial, 'd')).toBe('LOCKED')
    expect(partial.nodes.find((x) => x.id === 'd')!.blockedBy).toEqual(['c'])

    const full = resolvePathwayProgress(nodes, edges, new Set(['a', 'b', 'c']))
    expect(statusOf(full, 'd')).toBe('AVAILABLE')
  })

  // Work is never gated on the floor, so someone can finish a guide out of
  // order. That completion must stick rather than being recomputed away.
  it('keeps a completed node DONE even when its prerequisites are not', () => {
    const res = resolvePathwayProgress([n('a'), n('b')], [e('a', 'b')], new Set(['b']))
    expect(statusOf(res, 'b')).toBe('DONE')
    expect(statusOf(res, 'a')).toBe('AVAILABLE')
  })

  it('cascades through a chain in one call', () => {
    const nodes = [n('a'), n('b'), n('c')]
    const edges = [e('a', 'b'), e('b', 'c')]
    const res = resolvePathwayProgress(nodes, edges, new Set(['a', 'b']))
    expect(statusOf(res, 'c')).toBe('AVAILABLE')
  })

  it('ignores edges pointing at nodes that are not in the pathway', () => {
    const res = resolvePathwayProgress([n('a')], [e('ghost', 'a')], new Set())
    expect(statusOf(res, 'a')).toBe('AVAILABLE')
  })

  describe('milestones', () => {
    it('awards a milestone automatically once its prerequisites are done', () => {
      const nodes = [n('a'), n('m', { kind: 'MILESTONE', points: 50 })]
      const res = resolvePathwayProgress(nodes, [e('a', 'm')], new Set(['a']))
      expect(statusOf(res, 'm')).toBe('DONE')
      expect(res.earnedPoints).toBe(60)
    })

    it('locks a milestone while any prerequisite is outstanding', () => {
      const nodes = [n('a'), n('b'), n('m', { kind: 'MILESTONE' })]
      const edges = [e('a', 'm'), e('b', 'm')]
      const res = resolvePathwayProgress(nodes, edges, new Set(['a']))
      expect(statusOf(res, 'm')).toBe('LOCKED')
      expect(res.nodes.find((x) => x.id === 'm')!.blockedBy).toEqual(['b'])
    })

    it('leaves an unwired milestone AVAILABLE rather than instantly DONE', () => {
      const res = resolvePathwayProgress([n('m', { kind: 'MILESTONE' })], [], new Set())
      expect(statusOf(res, 'm')).toBe('AVAILABLE')
    })

    it('never treats a milestone as done just because it is in the completed set', () => {
      const nodes = [n('a'), n('m', { kind: 'MILESTONE' })]
      const res = resolvePathwayProgress(nodes, [e('a', 'm')], new Set(['m']))
      expect(statusOf(res, 'm')).toBe('LOCKED')
    })

    it('cascades a milestone into the milestone that follows it', () => {
      const nodes = [
        n('a'),
        n('m1', { kind: 'MILESTONE' }),
        n('m2', { kind: 'MILESTONE' }),
      ]
      const edges = [e('a', 'm1'), e('m1', 'm2')]
      const res = resolvePathwayProgress(nodes, edges, new Set(['a']))
      expect(statusOf(res, 'm1')).toBe('DONE')
      expect(statusOf(res, 'm2')).toBe('DONE')
    })
  })

  it('locks nodes caught in a cycle instead of hanging', () => {
    const nodes = [n('a'), n('b'), n('c')]
    const edges = [e('a', 'b'), e('b', 'a'), e('c', 'c')]
    const res = resolvePathwayProgress(nodes, edges, new Set())
    expect(statusOf(res, 'a')).toBe('LOCKED')
    expect(statusOf(res, 'b')).toBe('LOCKED')
    expect(statusOf(res, 'c')).toBe('LOCKED')
  })

  describe('points', () => {
    it('totals all node points and earns only completed ones', () => {
      const nodes = [n('a', { points: 30 }), n('b', { points: 20 }), n('c', { points: 5 })]
      const res = resolvePathwayProgress(nodes, [], new Set(['a', 'c']))
      expect(res.totalPoints).toBe(55)
      expect(res.earnedPoints).toBe(35)
    })

    it('reports level and the next threshold from earned points', () => {
      const res = resolvePathwayProgress([n('a', { points: 60 })], [], new Set(['a']))
      expect(res.earnedPoints).toBe(60)
      expect(res.level).toBe(2)
      expect(res.nextLevelAt).toBe(150)
    })
  })
})

describe('levelForPoints', () => {
  it('starts at level 1', () => {
    expect(levelForPoints(0)).toBe(1)
    expect(levelForPoints(49)).toBe(1)
  })

  it('steps up at each threshold', () => {
    expect(levelForPoints(50)).toBe(2)
    expect(levelForPoints(150)).toBe(3)
    expect(levelForPoints(1400)).toBe(8)
  })

  it('keeps climbing past the table at a fixed step', () => {
    expect(levelForPoints(1800)).toBe(9)
    expect(levelForPoints(2200)).toBe(10)
  })

  it('treats negative points as zero', () => {
    expect(levelForPoints(-100)).toBe(1)
  })
})

describe('nextLevelThreshold', () => {
  it('returns the next threshold in the table', () => {
    expect(nextLevelThreshold(0)).toBe(50)
    expect(nextLevelThreshold(60)).toBe(150)
  })

  it('extends past the table by the fixed step', () => {
    expect(nextLevelThreshold(1400)).toBe(1800)
    expect(nextLevelThreshold(1800)).toBe(2200)
  })
})

describe('findPathwayCycle', () => {
  it('returns null for an acyclic graph', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(findPathwayCycle(nodes, [e('a', 'b'), e('b', 'c')])).toBeNull()
  })

  it('returns null for a diamond', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const edges = [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd')]
    expect(findPathwayCycle(nodes, edges)).toBeNull()
  })

  it('finds a two-node cycle', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }]
    expect(findPathwayCycle(nodes, [e('a', 'b'), e('b', 'a')])).not.toBeNull()
  })

  it('finds a self-loop', () => {
    expect(findPathwayCycle([{ id: 'a' }], [e('a', 'a')])).toEqual(['a', 'a'])
  })

  it('finds a cycle reachable only from a separate root', () => {
    const nodes = [{ id: 'root' }, { id: 'a' }, { id: 'b' }]
    const edges = [e('root', 'a'), e('a', 'b'), e('b', 'a')]
    expect(findPathwayCycle(nodes, edges)).not.toBeNull()
  })

  it('ignores edges referencing unknown nodes', () => {
    expect(findPathwayCycle([{ id: 'a' }], [e('a', 'ghost'), e('ghost', 'a')])).toBeNull()
  })
})
