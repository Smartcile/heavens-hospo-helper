import { describe, it, expect, vi } from 'vitest'
import { explodeRecipe } from './inventory-engine'
import type { PrismaClient } from '@prisma/client'

// ── Test data ──

const uomEach = { id: 'uom-ea', name: 'EACH', baseUnit: 'ea', conversionRatio: 1 }
const uomMl = { id: 'uom-ml', name: 'mL', baseUnit: 'mL', conversionRatio: 1 }
const uomGram = { id: 'uom-g', name: 'GRAM', baseUnit: 'g', conversionRatio: 1 }
const uomLitre = { id: 'uom-l', name: 'LITRE', baseUnit: 'mL', conversionRatio: 1000 }
const uomCup = { id: 'uom-cup', name: 'CUP', baseUnit: 'mL', conversionRatio: 250 }
const uomKg = { id: 'uom-kg', name: 'KILOGRAM', baseUnit: 'g', conversionRatio: 1000 }

const eggs = { id: 'item-eggs', name: 'EGGS' }
const butter = { id: 'item-butter', name: 'BUTTER' }
const lemonJuice = { id: 'item-lemon', name: 'LEMON JUICE' }

const hollandaise = {
  id: 'recipe-hol',
  name: 'HOLLANDAISE SAUCE',
  yieldQty: 1,
  yieldUnitId: 'uom-l',
  yieldUnit: uomLitre,
  lineItems: [
    {
      qty: 200,
      uomId: 'uom-g',
      uom: uomGram,
      inventoryItemId: 'item-butter',
      inventoryItem: butter,
      childRecipeId: null,
      childRecipe: null,
    },
    {
      qty: 50,
      uomId: 'uom-ml',
      uom: uomMl,
      inventoryItemId: 'item-lemon',
      inventoryItem: lemonJuice,
      childRecipeId: null,
      childRecipe: null,
    },
  ],
}

const eggsBenedict = {
  id: 'recipe-eb',
  name: 'EGGS BENEDICT',
  yieldQty: 1,
  yieldUnitId: 'uom-ea',
  yieldUnit: uomEach,
  lineItems: [
    {
      qty: 2,
      uomId: 'uom-ea',
      uom: uomEach,
      inventoryItemId: 'item-eggs',
      inventoryItem: eggs,
      childRecipeId: null,
      childRecipe: null,
    },
    {
      qty: 50,
      uomId: 'uom-ml',
      uom: uomMl,
      inventoryItemId: null,
      inventoryItem: null,
      childRecipeId: 'recipe-hol',
      childRecipe: hollandaise,
    },
  ],
}

const emptyRecipe = {
  id: 'recipe-empty',
  name: 'EMPTY',
  yieldQty: 1,
  yieldUnitId: 'uom-ea',
  yieldUnit: uomEach,
  lineItems: [] as any[],
}

// The mixed-dimension recipe — the bug this feature exists to fix: the same
// item used as 1 CUP (volume) and 0.5 KG (mass) used to sum 250 + 500 = 750
// mixed units. With density on the item both lines report grams: 132 + 500.
const flourWithDensity = { id: 'item-flour', name: 'FLOUR - 00', densityGramsPerMl: 0.528, weightPerUnitGrams: null }
const mixedRecipe = {
  id: 'recipe-mixed',
  name: 'MIXED UNITS',
  yieldQty: 1,
  yieldUnitId: 'uom-ea',
  yieldUnit: uomEach,
  lineItems: [
    {
      qty: 1,
      uomId: 'uom-cup',
      uom: uomCup,
      inventoryItemId: 'item-flour',
      inventoryItem: flourWithDensity,
      childRecipeId: null,
      childRecipe: null,
    },
    {
      qty: 0.5,
      uomId: 'uom-kg',
      uom: uomKg,
      inventoryItemId: 'item-flour',
      inventoryItem: flourWithDensity,
      childRecipeId: null,
      childRecipe: null,
    },
  ],
}

// Count → grams: an item with only weightPerUnitGrams still canonicalises.
const denseEggs = { id: 'item-eggs', name: 'EGGS', densityGramsPerMl: null, weightPerUnitGrams: 50 }
const countRecipe = {
  id: 'recipe-count',
  name: 'COUNT TO GRAMS',
  yieldQty: 1,
  yieldUnitId: 'uom-ea',
  yieldUnit: uomEach,
  lineItems: [
    {
      qty: 3,
      uomId: 'uom-ea',
      uom: uomEach,
      inventoryItemId: 'item-eggs',
      inventoryItem: denseEggs,
      childRecipeId: null,
      childRecipe: null,
    },
  ],
}

// An item with density but a line that cannot convert (COUNT line, no unit
// weight) falls back to base units rather than being dropped.
const denseNoUnitWeight = { id: 'item-lemon', name: 'LEMON', densityGramsPerMl: 1.03, weightPerUnitGrams: null }
const fallbackRecipe = {
  id: 'recipe-fallback',
  name: 'FALLBACK',
  yieldQty: 1,
  yieldUnitId: 'uom-ea',
  yieldUnit: uomEach,
  lineItems: [
    {
      qty: 2,
      uomId: 'uom-ea',
      uom: uomEach,
      inventoryItemId: 'item-lemon',
      inventoryItem: denseNoUnitWeight,
      childRecipeId: null,
      childRecipe: null,
    },
  ],
}

// A pantry-bible line (IngredientReference) is knowledge, not stock — it must
// not appear in the explosion, while sibling inventory lines still explode.
const flourRef = { id: 'ref-flour', name: 'FLOUR - 00', densityGramsPerMl: 0.528, weightPerUnitGrams: null }
const pantryRecipe = {
  id: 'recipe-pantry',
  name: 'PANTRY MIX',
  yieldQty: 1,
  yieldUnitId: 'uom-ea',
  yieldUnit: uomEach,
  lineItems: [
    {
      qty: 1,
      uomId: 'uom-cup',
      uom: uomCup,
      inventoryItemId: null,
      inventoryItem: null,
      childRecipeId: null,
      childRecipe: null,
      ingredientReferenceId: 'ref-flour',
      ingredientReference: flourRef,
    },
    {
      qty: 200,
      uomId: 'uom-g',
      uom: uomGram,
      inventoryItemId: 'item-butter',
      inventoryItem: butter,
      childRecipeId: null,
      childRecipe: null,
      ingredientReferenceId: null,
      ingredientReference: null,
    },
  ],
}

function makePrisma(overrides?: Record<string, any>) {
  return {
    recipe: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        if (overrides?.[where.id]) return overrides[where.id]
        if (where.id === 'recipe-eb') return eggsBenedict
        if (where.id === 'recipe-hol') return hollandaise
        if (where.id === 'recipe-empty') return emptyRecipe
        if (where.id === 'recipe-mixed') return mixedRecipe
        if (where.id === 'recipe-count') return countRecipe
        if (where.id === 'recipe-fallback') return fallbackRecipe
        if (where.id === 'recipe-pantry') return pantryRecipe
        throw new Error(`Recipe not found: ${where.id}`)
      }),
    },
  } as unknown as PrismaClient
}

// ── Tests ──

describe('inventory-engine', () => {
  describe('explodeRecipe', () => {
    it('flattens a nested recipe (10x Eggs Benedict)', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-eb', 10, prisma)

      // 10x EB need 500 mL Hollandaise (50ml × 10)
      // 1 L Hol = 1000 mL, so subMultiplier = 500/1000 = 0.5
      // Butter: 200 × 0.5 × 1 = 100
      // Lemon:   50 × 0.5 × 1 = 25
      // Eggs:    2 × 10 × 1 = 20
      expect(result.get('item-eggs')).toBe(20)
      expect(result.get('item-butter')).toBe(100)
      expect(result.get('item-lemon')).toBe(25)
      expect(result.size).toBe(3)
    })

    it('handles a single-level recipe (2x Hollandaise)', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-hol', 2, prisma)

      expect(result.get('item-butter')).toBe(400) // 200 × 2 × 1
      expect(result.get('item-lemon')).toBe(100)  // 50 × 2 × 1
      expect(result.size).toBe(2)
    })

    it('throws on circular recipe references', async () => {
      const recipeA: any = {
        id: 'recipe-a',
        yieldQty: 1,
        yieldUnitId: 'uom-ea',
        yieldUnit: uomEach,
        lineItems: [
          { qty: 1, uomId: 'uom-ea', uom: uomEach, inventoryItemId: null, inventoryItem: null, childRecipeId: 'recipe-b', childRecipe: null },
        ],
      }
      const recipeB: any = {
        id: 'recipe-b',
        yieldQty: 1,
        yieldUnitId: 'uom-ea',
        yieldUnit: uomEach,
        lineItems: [
          { qty: 1, uomId: 'uom-ea', uom: uomEach, inventoryItemId: null, inventoryItem: null, childRecipeId: 'recipe-a', childRecipe: null },
        ],
      }
      // Cross-reference the childRecipes after creation
      recipeA.lineItems[0].childRecipe = recipeB as any
      recipeB.lineItems[0].childRecipe = recipeA as any

      const prisma = makePrisma({ 'recipe-a': recipeA, 'recipe-b': recipeB })

      await expect(explodeRecipe('recipe-a', 1, prisma)).rejects.toThrow('Circular recipe reference: recipe-a')
    })

    it('returns empty map when quantityMultiplier is 0', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-eb', 0, prisma)

      expect(result.size).toBe(0)
    })

    it('handles recipes with no line items', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-empty', 5, prisma)

      expect(result.size).toBe(0)
    })

    it('canonicalises mixed CUP + KG lines to grams when the item has density', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-mixed', 1, prisma)

      // 1 CUP = 250 mL × 0.528 = 132 g; 0.5 KG = 500 g → 632 g total.
      // The old behaviour summed 250 + 500 = 750 (mL + g mixed).
      expect(result.get('item-flour')).toBeCloseTo(632, 0)
      expect(result.size).toBe(1)
    })

    it('converts count lines to grams via weightPerUnitGrams', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-count', 1, prisma)

      expect(result.get('item-eggs')).toBe(150) // 3 EA × 50 g
    })

    it('falls back to base units for unconvertible lines instead of dropping them', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-fallback', 1, prisma)

      // COUNT line, no unit weight → base qty (2 EA), not dropped.
      expect(result.get('item-lemon')).toBe(2)
    })

    it('skips pantry-bible lines — they are references, not stock', async () => {
      const prisma = makePrisma()

      const result = await explodeRecipe('recipe-pantry', 2, prisma)

      // The pantry flour line (1 CUP) contributes nothing to stock; the
      // butter line still explodes: 200 × 2 × 1 = 400.
      expect(result.get('item-butter')).toBe(400)
      expect(result.get('ref-flour')).toBeUndefined()
      expect(result.size).toBe(1)
    })
  })
})
