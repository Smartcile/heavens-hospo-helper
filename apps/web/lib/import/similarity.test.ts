import { describe, expect, it } from 'vitest'
import { findSimilar, levenshtein, normaliseImportKey, tokenJaccard } from './similarity'

describe('normaliseImportKey', () => {
  it('trims, collapses whitespace and uppercases', () => {
    expect(normaliseImportKey('  fish   & chips ')).toBe('FISH & CHIPS')
  })
  it('handles non-strings', () => {
    expect(normaliseImportKey(null)).toBe('')
  })
})

describe('tokenJaccard', () => {
  it('is 1 for identical token sets', () => {
    expect(tokenJaccard('FISH AND CHIPS', 'CHIPS AND FISH')).toBe(1)
  })
  it('is 0 for disjoint names', () => {
    expect(tokenJaccard('FISH', 'STEAK')).toBe(0)
  })
})

describe('levenshtein', () => {
  it('measures edits', () => {
    expect(levenshtein('FISH', 'FISH')).toBe(0)
    expect(levenshtein('FISH', 'FIST')).toBe(1)
  })
})

describe('findSimilar', () => {
  it('finds a near duplicate but not a different product', () => {
    const existing = [
      { id: '1', name: 'FISH & CHIPS' },
      { id: '2', name: 'STEAK FRITES' },
    ]
    expect(findSimilar('FISH & CHIPZ', existing)?.target.id).toBe('1')
    expect(findSimilar('LAMB RACK', existing)).toBeNull()
  })
})
