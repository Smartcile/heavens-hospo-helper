import { describe, expect, it } from 'vitest'
import {
  buildPriceMovement,
  describePriceMovement,
  shouldAlert,
} from './price-movements'

describe('buildPriceMovement', () => {
  it('flags an increase as a warning', () => {
    const movement = buildPriceMovement({
      oldPrice: 1.2,
      newPrice: 1.35,
      itemName: 'FLOUR - 00',
      source: 'RECEIPT',
    })
    expect(movement.changed).toBe(true)
    expect(movement.direction).toBe('UP')
    expect(movement.severity).toBe('WARNING')
    expect(movement.delta).toBeCloseTo(0.15, 5)
    expect(movement.percent).toBe(12.5)
    expect(shouldAlert(movement)).toBe(true)
  })

  it('treats a decrease as info', () => {
    const movement = buildPriceMovement({
      oldPrice: 2,
      newPrice: 1.5,
      itemName: 'SUGAR',
      source: 'INVOICE',
    })
    expect(movement.direction).toBe('DOWN')
    expect(movement.severity).toBe('INFO')
    expect(movement.delta).toBeCloseTo(-0.5, 5)
    expect(movement.percent).toBe(-25)
    expect(shouldAlert(movement)).toBe(false)
  })

  it('detects no change within epsilon', () => {
    const movement = buildPriceMovement({
      oldPrice: 1.2,
      newPrice: 1.20005,
      itemName: 'SALT',
      source: 'MANUAL',
    })
    expect(movement.changed).toBe(false)
    expect(movement.direction).toBe('SAME')
    expect(movement.severity).toBe('INFO')
  })

  it('has no percentage without an old price', () => {
    const movement = buildPriceMovement({
      oldPrice: null,
      newPrice: 3,
      itemName: 'NEW ITEM',
      source: 'RECEIPT',
    })
    expect(movement.changed).toBe(false)
    expect(movement.percent).toBeNull()
    expect(movement.direction).toBe('SAME')
  })
})

describe('describePriceMovement', () => {
  it('renders old -> new with the percentage', () => {
    const movement = buildPriceMovement({
      oldPrice: 1.2,
      newPrice: 1.35,
      itemName: 'FLOUR - 00',
      source: 'RECEIPT',
    })
    expect(
      describePriceMovement({
        itemName: 'FLOUR - 00',
        oldPrice: 1.2,
        newPrice: 1.35,
        percent: movement.percent,
      }),
    ).toBe('FLOUR - 00: $1.20 -> $1.35 (+12.5%)')
  })

  it('labels a missing old price as NEW', () => {
    expect(describePriceMovement({ itemName: 'X', oldPrice: null, newPrice: 4, percent: null })).toBe(
      'X: — -> $4.00 (NEW)',
    )
  })
})
