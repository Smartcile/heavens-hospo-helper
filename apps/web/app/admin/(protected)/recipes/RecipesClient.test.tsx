import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecipesClient } from '@/app/admin/(protected)/recipes/RecipesClient'

const RECIPE = {
  id: 'r1',
  name: 'PIZZA DOUGH',
  yieldQty: 1,
  yieldUnitId: 'u-cup',
  yieldUnit: { id: 'u-cup', name: 'CUP' },
  instructions: null,
  prepTime: null,
  version: 1,
  isActive: true,
  lineItems: [
    {
      id: 'li1',
      qty: 2,
      uomId: 'u-cup',
      inventoryItemId: 'i-flour',
      childRecipeId: null,
      inventoryItem: { id: 'i-flour', name: 'FLOUR - 00', unit: 'EA', allergyInfo: null, densityGramsPerMl: 0.528, weightPerUnitGrams: null },
      childRecipe: null,
    },
    {
      id: 'li2',
      qty: 3,
      uomId: 'u-ea',
      inventoryItemId: 'i-eggs',
      childRecipeId: null,
      inventoryItem: { id: 'i-eggs', name: 'EGGS', unit: 'EA', allergyInfo: null, densityGramsPerMl: null, weightPerUnitGrams: null },
      childRecipe: null,
    },
  ],
  menuItem: null,
}

const UOMS = [
  { id: 'u-cup', name: 'CUP', baseUnit: 'mL', conversionRatio: 250, kind: 'VOLUME' },
  { id: 'u-ea', name: 'EACH', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' },
  { id: 'u-g', name: 'GRAM', baseUnit: 'g', conversionRatio: 1, kind: 'MASS' },
]

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    const json = async () => {
      if (url.includes('/api/admin/recipes')) return [RECIPE]
      if (url.includes('/api/admin/uoms')) return UOMS
      if (url.includes('/api/admin/inventory/categories')) return []
      if (url.includes('/api/admin/menus')) return []
      if (url.includes('/api/admin/woocommerce/categories')) return { categories: [] }
      if (url.includes('/api/admin/menu-items')) return []
      if (url.includes('/api/admin/inventory')) return []
      return []
    }
    return Promise.resolve({ ok: true, json } as Response)
  })
}

describe('RecipesClient — volume/weight display mode', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function openRecipe() {
    render(<RecipesClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('PIZZA DOUGH')).toBeTruthy())
    fireEvent.click(screen.getByText('PIZZA DOUGH'))
    await waitFor(() => expect(screen.getByText('INGREDIENTS & SUB-RECIPES')).toBeTruthy())
  }

  it('shows native units in VOLUME mode (default)', async () => {
    await openRecipe()
    expect(screen.getByText('×2 CUP')).toBeTruthy()
    expect(screen.getByText('×3 EACH')).toBeTruthy()
  })

  it('WEIGHT mode converts volume lines to grams via density and flags missing density', async () => {
    await openRecipe()
    fireEvent.click(screen.getByRole('button', { name: 'WEIGHT' }))
    expect(screen.getByText('×2 CUP · ≈ 264 G')).toBeTruthy() // 2 × 250 mL × 0.528
    expect(screen.getByText('×3 EACH · NO DENSITY')).toBeTruthy()
  })

  it('switching back to VOLUME restores native display', async () => {
    await openRecipe()
    fireEvent.click(screen.getByRole('button', { name: 'WEIGHT' }))
    fireEvent.click(screen.getByRole('button', { name: 'VOLUME' }))
    expect(screen.getByText('×2 CUP')).toBeTruthy()
  })
})
