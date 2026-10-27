import { describe, it, expect } from 'vitest'
import { dayRange, fillRect, fillTargets, inFillRect, toggleSelection } from '@/lib/cell-fill'

describe('fillRect', () => {
  it('orders the bounds regardless of drag direction', () => {
    expect(fillRect({ row: 3, col: 5 }, { row: 1, col: 2 })).toEqual({
      rowMin: 1, rowMax: 3, colMin: 2, colMax: 5,
    })
  })

  it('a single cell rect is the cell itself', () => {
    expect(fillRect({ row: 2, col: 2 }, { row: 2, col: 2 })).toEqual({
      rowMin: 2, rowMax: 2, colMin: 2, colMax: 2,
    })
  })
})

describe('inFillRect', () => {
  const rect = fillRect({ row: 1, col: 1 }, { row: 2, col: 3 })

  it('includes edges and interior', () => {
    expect(inFillRect({ row: 1, col: 1 }, rect)).toBe(true)
    expect(inFillRect({ row: 2, col: 3 }, rect)).toBe(true)
    expect(inFillRect({ row: 1, col: 3 }, rect)).toBe(true)
  })

  it('excludes outside cells', () => {
    expect(inFillRect({ row: 0, col: 2 }, rect)).toBe(false)
    expect(inFillRect({ row: 2, col: 4 }, rect)).toBe(false)
  })
})

describe('fillTargets', () => {
  it('covers the rectangle minus the source cell', () => {
    const rect = fillRect({ row: 0, col: 0 }, { row: 1, col: 1 })
    expect(fillTargets({ row: 0, col: 0 }, rect)).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ])
  })

  it('fills only a day range in a single-row rect (availability)', () => {
    const rect = fillRect({ row: 0, col: 2 }, { row: 0, col: 4 })
    expect(fillTargets({ row: 0, col: 2 }, rect)).toEqual([
      { row: 0, col: 3 },
      { row: 0, col: 4 },
    ])
  })

  it('supports dragging backwards (right to left)', () => {
    const rect = fillRect({ row: 0, col: 4 }, { row: 0, col: 2 })
    expect(fillTargets({ row: 0, col: 4 }, rect)).toEqual([
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ])
  })

  it('returns nothing for a single-cell rect', () => {
    expect(fillTargets({ row: 5, col: 5 }, fillRect({ row: 5, col: 5 }, { row: 5, col: 5 }))).toEqual([])
  })
})

describe('dayRange', () => {
  it('returns an inclusive range', () => {
    expect(dayRange(2, 4)).toEqual([2, 3, 4])
    expect(dayRange(2, 2)).toEqual([2])
  })

  it('works backwards and never goes below zero', () => {
    expect(dayRange(4, 2)).toEqual([2, 3, 4])
    expect(dayRange(-3, 1)).toEqual([0, 1])
  })
})

describe('toggleSelection', () => {
  it('adds and removes without mutating the source', () => {
    const first = new Set<string>(['a'])
    const added = toggleSelection(first, 'b')
    expect([...added].sort()).toEqual(['a', 'b'])
    expect([...first]).toEqual(['a'])

    const removed = toggleSelection(added, 'a')
    expect([...removed]).toEqual(['b'])
  })
})
