import { describe, it, expect } from 'vitest'
import {
  describeInventoryBlocker,
  sortInventoryBlockers,
  summariseInventoryBlockers,
  INVENTORY_BLOCKER_HREF,
  INVENTORY_IN_USE_ERROR,
  type InventoryBlocker,
} from './inventory-usage'

describe('inventory-usage', () => {
  it('describes singular and plural blockers in plain English', () => {
    expect(describeInventoryBlocker('RECIPE', 1)).toBe('Used in a recipe')
    expect(describeInventoryBlocker('RECIPE', 3)).toBe('Used in 3 recipes')
    expect(describeInventoryBlocker('FLOOR_PLAN_ELEMENT', 1)).toBe('Used on a floor plan element')
    expect(describeInventoryBlocker('STOCKTAKE', 2)).toBe('Counted in 2 stocktakes')
    expect(describeInventoryBlocker('TASK', 1)).toBe('Linked to a task')
    expect(describeInventoryBlocker('MENU_OPTION', 1)).toBe('Used as a product option on a menu product')
    expect(describeInventoryBlocker('MENU_OPTION', 2)).toBe('Used as a product option on 2 menu products')
    expect(describeInventoryBlocker('FURNITURE_BOM', 2)).toBe('Used on 2 furniture bills of materials')
  })

  it('exposes a stable error code and a management page for every kind', () => {
    expect(INVENTORY_IN_USE_ERROR).toBe('IN USE')
    expect(INVENTORY_BLOCKER_HREF.RECIPE).toBe('/admin/ops?tab=inventory&sub=recipes')
    expect(INVENTORY_BLOCKER_HREF.STOCKTAKE).toBe('/admin/ops?tab=inventory&sub=stocktake')
    expect(INVENTORY_BLOCKER_HREF.FLOOR_PLAN_ELEMENT).toBe('/admin/events?tab=rooms')
    expect(INVENTORY_BLOCKER_HREF.MENU_OPTION).toBe('/admin/ops?tab=inventory&sub=menu-items')
  })

  it('sorts blockers into the fixed human order', () => {
    const blockers: InventoryBlocker[] = [
      { kind: 'PRICE_MOVEMENT', count: 1, label: 'Has a price history entry', href: '#' },
      { kind: 'FLOOR_PLAN_ELEMENT', count: 1, label: 'Used on a floor plan element', href: '#' },
      { kind: 'RECIPE', count: 2, label: 'Used in 2 recipes', href: '#' },
    ]
    expect(sortInventoryBlockers(blockers).map((b) => b.kind)).toEqual([
      'FLOOR_PLAN_ELEMENT',
      'RECIPE',
      'PRICE_MOVEMENT',
    ])
  })

  it('summarises the total number of links', () => {
    expect(summariseInventoryBlockers([])).toBe('')
    const blockers: InventoryBlocker[] = [
      { kind: 'RECIPE', count: 2, label: 'Used in 2 recipes', href: '#' },
      { kind: 'TASK', count: 1, label: 'Linked to a task', href: '#' },
    ]
    expect(summariseInventoryBlockers(blockers)).toBe(
      'This item is still in use (3 links). Remove it from the places below, or cancel.',
    )
  })
})
