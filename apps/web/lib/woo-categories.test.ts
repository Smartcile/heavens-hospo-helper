import { describe, it, expect } from 'vitest'
import { matchCategoryByName } from './woo-categories'

describe('matchCategoryByName', () => {
  const categories = [
    { id: 15, name: 'Uncategorized' },
    { id: 17, name: 'MAINS' },
    { id: 19, name: 'Desserts' },
  ]

  it('matches case-insensitively', () => {
    expect(matchCategoryByName(categories, 'mains')?.id).toBe(17)
    expect(matchCategoryByName(categories, 'DESSERTS')?.id).toBe(19)
  })

  it('trims the query before matching', () => {
    expect(matchCategoryByName(categories, '  MAINS  ')?.id).toBe(17)
  })

  it('returns null when nothing matches', () => {
    expect(matchCategoryByName(categories, 'DRINKS')).toBeNull()
  })

  it('returns null for a blank name', () => {
    expect(matchCategoryByName(categories, '')).toBeNull()
    expect(matchCategoryByName(categories, '   ')).toBeNull()
  })

  it('returns null for an empty category list', () => {
    expect(matchCategoryByName([], 'MAINS')).toBeNull()
  })
})
