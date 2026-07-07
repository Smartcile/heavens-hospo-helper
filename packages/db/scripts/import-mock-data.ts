import { prisma } from '../index'
import data from './mock-data.json'

const VENUE_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  console.log('Importing mock data...\n')

  // ── Auto-seed built-in categories ──
  const BUILT_IN_CATS: { name: string; tab: string | null }[] = [
    { name: 'PROTEIN', tab: 'FOOD' }, { name: 'DAIRY', tab: 'FOOD' }, { name: 'PRODUCE', tab: 'FOOD' },
    { name: 'DRY GOODS', tab: 'FOOD' }, { name: 'BAKERY', tab: 'FOOD' }, { name: 'CONDIMENTS', tab: 'FOOD' },
    { name: 'LIQUOR', tab: 'BEVERAGE' }, { name: 'WINE', tab: 'BEVERAGE' }, { name: 'BEER', tab: 'BEVERAGE' },
    { name: 'SOFT DRINK', tab: 'BEVERAGE' }, { name: 'JUICE', tab: 'BEVERAGE' }, { name: 'COFFEE', tab: 'BEVERAGE' },
    { name: 'CUTLERY', tab: null }, { name: 'GLASSWARE', tab: null }, { name: 'LINEN', tab: null },
    { name: 'BARWARE', tab: null }, { name: 'CROCKERY', tab: null }, { name: 'CLEANING', tab: null },
    { name: 'MISCELLANEOUS', tab: null }, { name: 'FURNITURE', tab: null },
  ]
  for (const bi of BUILT_IN_CATS) {
    const existing = await prisma.inventoryCategory.findFirst({
      where: { name: bi.name, deletedAt: null },
    })
    if (!existing) {
      await prisma.inventoryCategory.create({ data: { name: bi.name, tab: bi.tab, isBuiltIn: true, venueId: null } })
    }
  }

  // ── Auto-seed built-in UOMs ──
  const BUILT_IN_UOMS: { name: string; baseUnit: string; conversionRatio: number }[] = [
    { name: 'EACH', baseUnit: 'ea', conversionRatio: 1 },
    { name: 'LITRE', baseUnit: 'mL', conversionRatio: 1000 },
    { name: '750ML BOTTLE', baseUnit: 'mL', conversionRatio: 750 },
    { name: '6 PACK 1L', baseUnit: 'mL', conversionRatio: 6000 },
    { name: 'KILOGRAM', baseUnit: 'g', conversionRatio: 1000 },
    { name: 'GRAM', baseUnit: 'g', conversionRatio: 1 },
    { name: 'ML', baseUnit: 'mL', conversionRatio: 1 },
    { name: 'BUNCH', baseUnit: 'ea', conversionRatio: 1 },
    { name: 'CASE 12', baseUnit: 'ea', conversionRatio: 12 },
    { name: 'CASE 24', baseUnit: 'ea', conversionRatio: 24 },
    { name: 'SLEEVE', baseUnit: 'ea', conversionRatio: 1 },
  ]
  for (const bi of BUILT_IN_UOMS) {
    const existing = await prisma.unitOfMeasure.findFirst({
      where: { name: bi.name, deletedAt: null },
    })
    if (!existing) {
      await prisma.unitOfMeasure.create({ data: { name: bi.name, baseUnit: bi.baseUnit, conversionRatio: bi.conversionRatio, isBuiltIn: true, venueId: null } })
    }
  }

  // ── Resolve UOMs ──
  const uoms = await prisma.unitOfMeasure.findMany({ where: { deletedAt: null } })
  const uomByName = new Map(uoms.map((u) => [u.name, u]))

  function resolveUom(name: string): string {
    const uom = uomByName.get(name)
    if (!uom) throw new Error(`UOM not found: ${name}`)
    return uom.id
  }

  // ── Resolve categories (built-in + venue-specific) ──
  const categories = await prisma.inventoryCategory.findMany({
    where: { deletedAt: null, OR: [{ venueId: VENUE_ID }, { venueId: null, isBuiltIn: true }] },
  })
  const catByName = new Map(categories.map((c) => [c.name, c]))

  function resolveCat(name: string): string {
    const cat = catByName.get(name)
    if (!cat) throw new Error(`Category not found: ${name}`)
    return cat.id
  }

  // ── 1. Create inventory items ──
  console.log('Creating inventory items...')
  const itemNameToId = new Map<string, string>()

  for (const inv of data.inventoryItems) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { name: inv.name, venueId: VENUE_ID, deletedAt: null },
    })
    if (existing) {
      itemNameToId.set(inv.name, existing.id)
      console.log(`  SKIP ${inv.name} (already exists)`)
      continue
    }

    const catId = resolveCat(inv.categoryId)
    const created = await prisma.inventoryItem.create({
      data: {
        venueId: VENUE_ID,
        categoryId: catId,
        name: inv.name,
        unit: inv.unit,
        totalQty: inv.totalQty,
        defaultParLevel: inv.defaultParLevel,
        costPrice: inv.costPrice,
        countingUnitId: inv.countingUnitId ? resolveUom(inv.countingUnitId) : null,
        orderingUnitId: inv.orderingUnitId ? resolveUom(inv.orderingUnitId) : null,
        yieldPercentage: inv.yieldPercentage ?? null,
        expiryDate: inv.expiryDate ? new Date(inv.expiryDate) : null,
      },
    })
    itemNameToId.set(inv.name, created.id)
    console.log(`  ✓ ${inv.name}`)
  }

  // ── 2. Topological sort recipes (sub-recipes first) ──
  const allRecipes = data.recipes
  const recipeNames = new Set(allRecipes.map((r) => r.name))
  const recipeByName = new Map(allRecipes.map((r) => [r.name, r]))
  const recipeNameToId = new Map<string, string>()

  // Sort: recipes that don't depend on any other recipes come first
  function missingDeps(name: string): string[] {
    const r = recipeByName.get(name)
    if (!r) return []
    return r.lineItems
      .filter((li) => li.childRecipeId && recipeNames.has(li.childRecipeId) && !recipeNameToId.has(li.childRecipeId))
      .map((li) => li.childRecipeId!)
  }

  const remaining = new Set(recipeNames)
  const MAX_PASSES = 10
  let passes = 0

  console.log('\nCreating recipes (topological order)...')
  while (remaining.size > 0 && passes < MAX_PASSES) {
    passes++
    const ready = [...remaining].filter((name) => missingDeps(name).length === 0)

    if (ready.length === 0) {
      const stuck = [...remaining].map((name) => `${name} (missing: ${missingDeps(name).join(', ')})`)
      throw new Error(`Circular dependency or missing sub-recipes: ${stuck.join('; ')}`)
    }

    for (const name of ready) {
      remaining.delete(name)
      const r = recipeByName.get(name)!
      const existing = await prisma.recipe.findFirst({
        where: { name, venueId: VENUE_ID, deletedAt: null },
      })
      if (existing) {
        recipeNameToId.set(name, existing.id)
        console.log(`  SKIP ${name} (already exists)`)
        continue
      }

      const yieldUnitId = resolveUom(r.yieldUnitId)

      const lineItemsCreate: any[] = []
      for (const li of r.lineItems) {
        const uomId = resolveUom(li.uomId)
        const base: any = { qty: li.qty, uomId, sortOrder: lineItemsCreate.length }
        if (li.inventoryItemId) {
          const itemId = itemNameToId.get(li.inventoryItemId)
          if (!itemId) throw new Error(`Inventory item not found: ${li.inventoryItemId} (recipe: ${name})`)
          base.inventoryItemId = itemId
        }
        if (li.childRecipeId) {
          const childId = recipeNameToId.get(li.childRecipeId)
          if (!childId) throw new Error(`Sub-recipe not found: ${li.childRecipeId} (recipe: ${name})`)
          base.childRecipeId = childId
        }
        lineItemsCreate.push(base)
      }

      const created = await prisma.recipe.create({
        data: {
          venueId: VENUE_ID,
          name,
          yieldQty: r.yieldQty,
          yieldUnitId,
          instructions: r.instructions,
          prepTime: r.prepTime,
          lineItems: lineItemsCreate.length > 0 ? { create: lineItemsCreate } : undefined,
        },
      })
      recipeNameToId.set(name, created.id)
      console.log(`  ✅ PASS ${passes}: ${name}`)
    }
  }

  // ── 3. Create menu items ──
  console.log('\nCreating menu items...')
  for (const mi of data.menuItems) {
    const existing = await prisma.menuItem.findFirst({
      where: { name: mi.name, venueId: VENUE_ID, deletedAt: null },
    })
    if (existing) {
      console.log(`  SKIP ${mi.name} (already exists)`)
      continue
    }

    const recipeId = recipeNameToId.get(mi.recipeId)
    if (!recipeId) throw new Error(`Recipe not found for menu item: ${mi.name} (recipe: ${mi.recipeId})`)

    await prisma.menuItem.create({
      data: {
        venueId: VENUE_ID,
        name: mi.name,
        recipeId,
        price: mi.price,
        wooProductId: mi.wooProductId,
        wooCategoryId: mi.wooCategoryId,
      },
    })
    console.log(`  ✓ ${mi.name}`)
  }

  console.log(`\nDone! ${data.inventoryItems.length} ingredients, ${data.recipes.length} recipes, ${data.menuItems.length} menu items.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
