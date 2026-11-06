import { describe, expect, it } from 'vitest'
import { inheritedAllergensFromRecipe } from './menu-item-allergens'

describe('inheritedAllergensFromRecipe', () => {
  it('collects allergens from inventory line items', () => {
    expect(
      inheritedAllergensFromRecipe({
        lineItems: [
          { inventoryItem: { id: 'i1', name: 'WHEAT FLOUR', allergyInfo: 'GLUTEN, WHEAT' } },
          { inventoryItem: { id: 'i2', name: 'MILK', allergyInfo: 'MILK' } },
        ],
      }),
    ).toEqual([
      { allergen: 'GLUTEN', source: 'WHEAT FLOUR', inherited: true },
      { allergen: 'WHEAT', source: 'WHEAT FLOUR', inherited: true },
      { allergen: 'MILK', source: 'MILK', inherited: true },
    ])
  })

  it('returns no allergens for a recipe with no ingredient allergens', () => {
    expect(
      inheritedAllergensFromRecipe({
        lineItems: [{ inventoryItem: { id: 'i1', name: 'SALT', allergyInfo: null } }],
      }),
    ).toEqual([])
  })

  it('is safe for a missing recipe', () => {
    expect(inheritedAllergensFromRecipe(null)).toEqual([])
    expect(inheritedAllergensFromRecipe({})).toEqual([])
  })
})
