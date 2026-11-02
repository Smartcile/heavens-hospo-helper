import { describe, it, expect } from 'vitest'
import { setupItemFurnitureKey } from './furniture'
import type { SetupItemInput } from '@hospo-ops/types'

function item(over: Partial<SetupItemInput> = {}): SetupItemInput {
  return { id: 'i1', x: 0, y: 0, rotation: 0, width: 80, depth: 80, ...over }
}

/**
 * These guard the join/snap and inventory-tally paths. Both group placements by
 * "which furniture is this?", and both used to read `tableProfileId` directly —
 * which every migrated row leaves null, so `null === null` matched everything.
 */
describe('setupItemFurnitureKey', () => {
  it('prefers the furniture item', () => {
    expect(setupItemFurnitureKey(item({ furnitureItemId: 'f1', tableProfileId: 'p1' }))).toBe('f1')
  })

  it('falls back to the deprecated profile for pre-migration rows', () => {
    expect(setupItemFurnitureKey(item({ tableProfileId: 'p1' }))).toBe('p1')
  })

  it('returns null when a placement points at nothing', () => {
    expect(setupItemFurnitureKey(item())).toBeNull()
    expect(setupItemFurnitureKey(item({ furnitureItemId: null, tableProfileId: null }))).toBeNull()
  })

  it('does not treat two unresolved placements as the same furniture', () => {
    // The bug: both keys null, so a naive `a.tableProfileId === b.tableProfileId`
    // says these are the same table type and snap-joins them.
    const a = setupItemFurnitureKey(item({ id: 'a' }))
    const b = setupItemFurnitureKey(item({ id: 'b' }))
    expect(a).toBeNull()
    expect(b).toBeNull()
    // Callers must gate on a non-null key rather than comparing directly.
    expect(a !== null && a === b).toBe(false)
  })

  it('distinguishes different furniture', () => {
    expect(setupItemFurnitureKey(item({ furnitureItemId: 'f1' })))
      .not.toBe(setupItemFurnitureKey(item({ furnitureItemId: 'f2' })))
  })

  it('matches a migrated row against a fresh one for the same furniture', () => {
    expect(setupItemFurnitureKey(item({ furnitureItemId: 'f1' })))
      .toBe(setupItemFurnitureKey(item({ furnitureItemId: 'f1', tableProfileId: 'oldp' })))
  })
})
