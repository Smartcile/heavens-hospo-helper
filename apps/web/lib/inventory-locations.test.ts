import { describe, it, expect } from 'vitest'
import { cleanStorageLocations, describeLocations } from './inventory-locations'

describe('cleanStorageLocations', () => {
  it('keeps valid rows, parses qty and trims notes', () => {
    expect(cleanStorageLocations([
      { sectionId: 'bar', qty: '5', notes: '  Top shelf ' },
      { sectionId: 'store', qty: '', notes: '' },
    ])).toEqual([
      { sectionId: 'bar', qty: 5, notes: 'Top shelf' },
      { sectionId: 'store', qty: null, notes: null },
    ])
  })

  it('drops blanks and de-dupes by section (first wins)', () => {
    expect(cleanStorageLocations([
      { sectionId: 'bar', qty: 1 },
      { qty: 9 },
      { sectionId: 'bar', qty: 2 },
    ])).toEqual([{ sectionId: 'bar', qty: 1, notes: null }])
  })

  it('returns [] for non-arrays', () => {
    expect(cleanStorageLocations(null)).toEqual([])
    expect(cleanStorageLocations('nope')).toEqual([])
  })
})

describe('describeLocations', () => {
  it('summarises locations with optional counts', () => {
    expect(describeLocations([
      { sectionName: 'BAR', qty: 5 },
      { sectionName: 'STOREROOM', qty: null },
    ])).toBe('BAR 5 · STOREROOM')
  })

  it('returns null when empty', () => {
    expect(describeLocations([])).toBeNull()
  })
})
