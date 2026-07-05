import { describe, it, expect } from 'vitest'
import { moveItem } from '@/lib/array'

describe('moveItem', () => {
  it('moves item from index to another', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('maintains relative order of other items', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves forward', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('moves backward', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('returns same array when from equals to', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('returns same array when from is out of bounds', () => {
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 2, 0)).toEqual(['a', 'b'])
  })

  it('returns same array when to is out of bounds', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 0, 2)).toEqual(['a', 'b'])
  })

  it('does not mutate original array', () => {
    const original = ['a', 'b', 'c']
    moveItem(original, 0, 2)
    expect(original).toEqual(['a', 'b', 'c'])
  })

  it('handles single-element array', () => {
    expect(moveItem(['a'], 0, 0)).toEqual(['a'])
  })
})
