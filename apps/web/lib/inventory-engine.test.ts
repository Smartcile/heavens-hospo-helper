import { describe, it, expect, vi } from 'vitest'
import { explodeRecipe } from './inventory-engine'
import type { PrismaClient } from '@prisma/client'

// ── Test data ──

const uomEach = { id: 'uom-ea', name: 'EACH', baseUnit: 'ea', conversionRatio: 1 }
const uomMl = { id: 'uom-ml', name: 'mL', baseUnit: 'mL', conversionRatio: 1 }
const uomGram = { id: 'uom-g', name: 'GRAM', baseUnit: 'g', conversionRatio: 1 }
const uomLitre = { id: 'uom-l', name: 'LITRE', baseUnit: 'mL', conversionRatio: 1000 }

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

function makePrisma(overrides?: Record<string, any>) {
  return {
    recipe: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        if (overrides?.[where.id]) return overrides[where.id]
        if (where.id === 'recipe-eb') return eggsBenedict
        if (where.id === 'recipe-hol') return hollandaise
        if (where.id === 'recipe-empty') return emptyRecipe
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
  })
})
