import { describe, it, expect } from 'vitest'
import {
  emptyEdgeChairs, edgeTotal, maxChairsForEdge, adjustEdgeChairs, defaultEdgeChairs,
} from './floorplan-chairs'

const rect = { width: 240, depth: 90, seatingDensity: 60, maxHeadChairs: 1, capacity: 8 }

describe('maxChairsForEdge', () => {
  it('fits floor(len/density) on long edges', () => {
    expect(maxChairsForEdge('top', rect)).toBe(4) // 240/60
    expect(maxChairsForEdge('bottom', rect)).toBe(4)
  })
  it('caps head (short) edges at maxHeadChairs', () => {
    // depth 90 / 60 = 1 anyway, but bump density down to prove the cap
    expect(maxChairsForEdge('left', { ...rect, seatingDensity: 20, maxHeadChairs: 1 })).toBe(1)
    expect(maxChairsForEdge('left', { ...rect, seatingDensity: 20, maxHeadChairs: 2 })).toBe(2)
  })
  it('falls back to default density when null', () => {
    expect(maxChairsForEdge('top', { ...rect, seatingDensity: null })).toBe(4)
  })
})

describe('adjustEdgeChairs', () => {
  it('adds a chair on an edge', () => {
    const r = adjustEdgeChairs(emptyEdgeChairs(), 'top', +1, rect)
    expect(r.top).toBe(1)
    expect(edgeTotal(r)).toBe(1)
  })
  it('removes a chair but never below zero', () => {
    const one = adjustEdgeChairs(emptyEdgeChairs(), 'top', +1, rect)
    const zero = adjustEdgeChairs(one, 'top', -1, rect)
    expect(zero.top).toBe(0)
    const stillZero = adjustEdgeChairs(zero, 'top', -1, rect)
    expect(stillZero.top).toBe(0)
  })
  it('does not exceed the edge physical max', () => {
    let e = emptyEdgeChairs()
    for (let i = 0; i < 10; i++) e = adjustEdgeChairs(e, 'top', +1, rect)
    expect(e.top).toBe(4) // maxed at 240/60
  })
  it('does not exceed total capacity', () => {
    const smallCap = { ...rect, capacity: 2 }
    let e = emptyEdgeChairs()
    e = adjustEdgeChairs(e, 'top', +1, smallCap)
    e = adjustEdgeChairs(e, 'bottom', +1, smallCap)
    const blocked = adjustEdgeChairs(e, 'top', +1, smallCap) // would be 3 > cap 2
    expect(edgeTotal(blocked)).toBe(2)
  })
  it('returns the same object when nothing changes', () => {
    const e = emptyEdgeChairs()
    expect(adjustEdgeChairs(e, 'top', -1, rect)).toBe(e)
  })
})

describe('defaultEdgeChairs', () => {
  it('fills long edges first, respecting capacity', () => {
    const e = defaultEdgeChairs(rect) // cap 8, long edges max 4 each
    expect(e.top).toBe(4)
    expect(e.bottom).toBe(4)
    expect(e.left).toBe(0)
    expect(e.right).toBe(0)
    expect(edgeTotal(e)).toBe(8)
  })
  it('spills onto head edges once long edges are full', () => {
    const e = defaultEdgeChairs({ ...rect, capacity: 10, seatingDensity: 60, maxHeadChairs: 1 })
    expect(e.top).toBe(4)
    expect(e.bottom).toBe(4)
    // depth 90/60 = 1 per head edge, capped at maxHeadChairs 1
    expect(e.left + e.right).toBe(2)
    expect(edgeTotal(e)).toBe(10)
  })
  it('never places more than capacity', () => {
    const e = defaultEdgeChairs({ ...rect, capacity: 3 })
    expect(edgeTotal(e)).toBe(3)
  })
})
