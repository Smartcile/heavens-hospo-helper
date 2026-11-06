import { describe, expect, it } from 'vitest'
import {
  describeLinkedItem,
  describeStorageLocation,
  describeStorageLocations,
  isDeletedItem,
} from './item-location'

describe('describeStorageLocation', () => {
  it('renders department, section and notes', () => {
    expect(
      describeStorageLocation({
        notes: 'TOP SHELF',
        section: { name: 'UNDER SINK', department: { name: 'BAR' } },
      }),
    ).toBe('BAR → UNDER SINK · TOP SHELF')
  })

  it('omits missing parts', () => {
    expect(describeStorageLocation({ section: { name: 'DRY STORE' } })).toBe('DRY STORE')
    expect(describeStorageLocation({ notes: 'LOCKED CUPBOARD' })).toBe('LOCKED CUPBOARD')
    expect(describeStorageLocation(null)).toBeNull()
  })
})

describe('describeStorageLocations', () => {
  it('joins multiple locations', () => {
    expect(
      describeStorageLocations({
        storageLocations: [
          { notes: 'TOP SHELF', section: { name: 'UNDER SINK', department: { name: 'BAR' } } },
          { section: { name: 'DRY STORE', department: { name: 'KITCHEN' } } },
        ],
      }),
    ).toBe('BAR → UNDER SINK · TOP SHELF | KITCHEN → DRY STORE')
  })

  it('falls back to storage notes', () => {
    expect(describeStorageLocations({ storageNotes: 'BEHIND THE BAR' })).toBe('BEHIND THE BAR')
  })

  it('returns an empty string when nothing is known', () => {
    expect(describeStorageLocations({})).toBe('')
    expect(describeStorageLocations(null)).toBe('')
  })
})

describe('describeLinkedItem', () => {
  it('combines the name and the location', () => {
    expect(
      describeLinkedItem({
        name: 'SPRAY BOTTLE',
        storageLocations: [{ notes: 'TOP SHELF', section: { name: 'UNDER SINK', department: { name: 'BAR' } } }],
      }),
    ).toBe('SPRAY BOTTLE · BAR → UNDER SINK · TOP SHELF')
  })

  it('uses the name alone when there is no location', () => {
    expect(describeLinkedItem({ name: 'SPRAY BOTTLE' })).toBe('SPRAY BOTTLE')
    expect(describeLinkedItem(null)).toBe('')
  })
})

describe('isDeletedItem', () => {
  it('detects a soft-deleted item', () => {
    expect(isDeletedItem({ name: 'X', deletedAt: '2026-11-01T00:00:00.000Z' })).toBe(true)
    expect(isDeletedItem({ name: 'X', deletedAt: null })).toBe(false)
    expect(isDeletedItem(null)).toBe(false)
  })
})
