/*
 * MOCK DATA — RECIPES, MENU ITEMS + INGREDIENTS
 *
 * Builds a realistic kitchen BOM so the Recipes / Menu Items pages can be seen
 * working end to end: ingredients (inventory items with deep fields + allergens),
 * recipes with line items (including a nested sub-recipe so the recursive BOM
 * shows), and menu items linked to recipes with WooCommerce link state.
 *
 * Idempotent — every row has a fixed id, so re-running refreshes rather than
 * duplicates. Scoped to one venue and touches nothing else.
 *
 *   npm run db:mock-menu              # THE TESTURANT
 *   npm run db:mock-menu -- <venueId>
 */
import { prisma, Prisma } from '../index'

const DEFAULT_VENUE_ID = '40e6b2e0-402e-4328-8f95-30818209fb6a' // THE TESTURANT

/** Fixed-id helpers, so re-running updates the same rows. */
const ING = (n: string) => `00000000-0000-0000-0f10-${n.padStart(12, '0')}` // ingredients
const RCP = (n: string) => `00000000-0000-0000-0f11-${n.padStart(12, '0')}` // recipes
const MI = (n: string) => `00000000-0000-0000-0f12-${n.padStart(12, '0')}` // menu items
const RLI = (n: string) => `00000000-0000-0000-0f13-${n.padStart(12, '0')}` // recipe line items

// ── Ingredients (inventory items, one per row, deep fields where useful) ──

interface IngredientSpec {
  id: string
  name: string
  category: string
  unit: string
  orderingUnit?: string
  countingUnit?: string
  parLevel: number
  cost?: number
  shelfLife?: number
  canFreeze?: boolean
  freezerShelfLife?: number
  allergens?: string
}

const INGREDIENTS: IngredientSpec[] = [
  // PROTEIN
  { id: ING('01'), name: 'CHICKEN THIGH', category: 'PROTEIN', unit: 'KILOGRAM', orderingUnit: 'CASE 12', countingUnit: 'GRAM', parLevel: 10, cost: 8.5, shelfLife: 3, canFreeze: true, freezerShelfLife: 90 },
  { id: ING('02'), name: 'BEEF MINCE', category: 'PROTEIN', unit: 'KILOGRAM', orderingUnit: 'CASE 12', countingUnit: 'GRAM', parLevel: 15, cost: 12.0, shelfLife: 2, canFreeze: true, freezerShelfLife: 60 },
  { id: ING('03'), name: 'LAMB RUMP', category: 'PROTEIN', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 6, cost: 18.0, shelfLife: 4, canFreeze: true, freezerShelfLife: 90 },
  { id: ING('04'), name: 'FISH FILLET — SNAPPER', category: 'PROTEIN', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 8, cost: 24.0, shelfLife: 2, canFreeze: true, freezerShelfLife: 60, allergens: 'FISH' },
  { id: ING('05'), name: 'BACON', category: 'PROTEIN', unit: 'KILOGRAM', parLevel: 5, cost: 14.0, shelfLife: 5, canFreeze: true, freezerShelfLife: 60 },
  // DAIRY
  { id: ING('06'), name: 'BUTTER', category: 'DAIRY', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 4, cost: 9.5, shelfLife: 21, canFreeze: true, freezerShelfLife: 180, allergens: 'DAIRY' },
  { id: ING('07'), name: 'CREAM 35%', category: 'DAIRY', unit: 'LITRE', countingUnit: 'ML', parLevel: 6, cost: 5.2, shelfLife: 7, allergens: 'DAIRY' },
  { id: ING('08'), name: 'MILK', category: 'DAIRY', unit: 'LITRE', countingUnit: 'ML', parLevel: 20, cost: 2.1, shelfLife: 7, allergens: 'DAIRY' },
  { id: ING('09'), name: 'CHEDDAR CHEESE', category: 'DAIRY', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 5, cost: 15.0, shelfLife: 28, canFreeze: true, freezerShelfLife: 120, allergens: 'DAIRY' },
  { id: ING('10'), name: 'EGGS', category: 'DAIRY', unit: 'EACH', orderingUnit: 'CASE 12', parLevel: 60, cost: 0.45, shelfLife: 21, allergens: 'EGGS' },
  // PRODUCE
  { id: ING('11'), name: 'POTATOES', category: 'PRODUCE', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 25, cost: 2.5, shelfLife: 21 },
  { id: ING('12'), name: 'ONIONS', category: 'PRODUCE', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 8, cost: 1.8, shelfLife: 30 },
  { id: ING('13'), name: 'TOMATOES', category: 'PRODUCE', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 6, cost: 4.2, shelfLife: 4 },
  { id: ING('14'), name: 'MIXED LEAVES', category: 'PRODUCE', unit: 'EACH', parLevel: 12, cost: 3.5, shelfLife: 3 },
  // DRY GOODS
  { id: ING('15'), name: 'FLOUR', category: 'DRY GOODS', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 10, cost: 1.9, shelfLife: 180, allergens: 'GLUTEN' },
  { id: ING('16'), name: 'PANKO BREADCRUMBS', category: 'DRY GOODS', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 6, cost: 6.5, shelfLife: 120, allergens: 'GLUTEN' },
  // BAKERY
  { id: ING('17'), name: 'BREAD ROLLS', category: 'BAKERY', unit: 'EACH', parLevel: 40, cost: 0.8, shelfLife: 2, allergens: 'GLUTEN' },
  // CONDIMENTS
  { id: ING('18'), name: 'VEGETABLE OIL', category: 'CONDIMENTS', unit: 'LITRE', parLevel: 10, cost: 3.2, shelfLife: 365 },
  { id: ING('19'), name: 'BURGER SAUCE', category: 'CONDIMENTS', unit: 'LITRE', countingUnit: 'ML', parLevel: 4, cost: 4.8, shelfLife: 90 },
  { id: ING('20'), name: 'SALT & PEPPER BLEND', category: 'CONDIMENTS', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 3, cost: 5.9, shelfLife: 365 },
  // BEVERAGE
  { id: ING('21'), name: 'COFFEE BEANS', category: 'BEVERAGE', unit: 'KILOGRAM', countingUnit: 'GRAM', parLevel: 6, cost: 38.0, shelfLife: 90 },
]

// ── Recipes (nested BOM: HOUSE BURGER uses BURGER PATTY as a sub-recipe) ──

interface LineSpec {
  item?: string // ingredient name
  recipe?: string // sub-recipe name
  qty: number
  unit: string
}

interface RecipeSpec {
  id: string
  name: string
  yieldQty: number
  yieldUnit: string
  prepTime?: number
  instructions?: string
  lines: LineSpec[]
}

const RECIPES: RecipeSpec[] = [
  {
    id: RCP('01'),
    name: 'BURGER PATTY',
    yieldQty: 12, yieldUnit: 'EACH', prepTime: 25,
    instructions: 'MIX MINCE, ONION, BREADCRUMBS AND SEASONING. PORTION INTO 12 × 180G PATTIES. REST CHILLED BEFORE GRIDDLING.',
    lines: [
      { item: 'BEEF MINCE', qty: 3, unit: 'KILOGRAM' },
      { item: 'ONIONS', qty: 0.5, unit: 'KILOGRAM' },
      { item: 'EGGS', qty: 2, unit: 'EACH' },
      { item: 'PANKO BREADCRUMBS', qty: 200, unit: 'GRAM' },
      { item: 'SALT & PEPPER BLEND', qty: 30, unit: 'GRAM' },
    ],
  },
  {
    id: RCP('02'),
    name: 'HOUSE BURGER',
    yieldQty: 1, yieldUnit: 'EACH', prepTime: 15,
    instructions: 'GRIDDLE THE PATTY, TOAST THE ROLL, MELT CHEDDAR ON THE PATTY. BURGER SAUCE ON THE LID, SALAD BELOW.',
    lines: [
      { recipe: 'BURGER PATTY', qty: 1, unit: 'EACH' },
      { item: 'BREAD ROLLS', qty: 1, unit: 'EACH' },
      { item: 'CHEDDAR CHEESE', qty: 40, unit: 'GRAM' },
      { item: 'BURGER SAUCE', qty: 30, unit: 'ML' },
      { item: 'MIXED LEAVES', qty: 20, unit: 'GRAM' },
      { item: 'TOMATOES', qty: 50, unit: 'GRAM' },
    ],
  },
  {
    id: RCP('03'),
    name: 'FISH & CHIPS',
    yieldQty: 1, yieldUnit: 'EACH', prepTime: 20,
    instructions: 'BEER-FREE CRUMBED SNAPPER — DIP IN EGG, DREDGE IN PANKO, FRY AT 180°C UNTIL GOLDEN. CHIPS TWICE-COOKED.',
    lines: [
      { item: 'FISH FILLET — SNAPPER', qty: 180, unit: 'GRAM' },
      { item: 'FLOUR', qty: 50, unit: 'GRAM' },
      { item: 'PANKO BREADCRUMBS', qty: 60, unit: 'GRAM' },
      { item: 'EGGS', qty: 1, unit: 'EACH' },
      { item: 'VEGETABLE OIL', qty: 300, unit: 'ML' },
      { item: 'POTATOES', qty: 250, unit: 'GRAM' },
    ],
  },
  {
    id: RCP('04'),
    name: 'CHICKEN PIE',
    yieldQty: 8, yieldUnit: 'EACH', prepTime: 45,
    instructions: 'BROWN CHICKEN AND ONION IN BUTTER. SPRINKLE FLOUR, ADD CREAM AND SIMMER. SHORTCRUST TOP, EGG WASH, BAKE 190°C / 25 MIN.',
    lines: [
      { item: 'CHICKEN THIGH', qty: 1.5, unit: 'KILOGRAM' },
      { item: 'BUTTER', qty: 300, unit: 'GRAM' },
      { item: 'FLOUR', qty: 400, unit: 'GRAM' },
      { item: 'CREAM 35%', qty: 500, unit: 'ML' },
      { item: 'ONIONS', qty: 400, unit: 'GRAM' },
      { item: 'POTATOES', qty: 800, unit: 'GRAM' },
    ],
  },
  {
    id: RCP('05'),
    name: 'GRILLED LAMB RUMP',
    yieldQty: 1, yieldUnit: 'EACH', prepTime: 30,
    instructions: 'SEAR RUMP 3 MIN PER SIDE, REST 5. ROSEMARY ROAST POTATOES, SALAD AND TOMATO SALSA.',
    lines: [
      { item: 'LAMB RUMP', qty: 250, unit: 'GRAM' },
      { item: 'POTATOES', qty: 200, unit: 'GRAM' },
      { item: 'MIXED LEAVES', qty: 30, unit: 'GRAM' },
      { item: 'TOMATOES', qty: 60, unit: 'GRAM' },
      { item: 'VEGETABLE OIL', qty: 20, unit: 'ML' },
    ],
  },
  {
    id: RCP('06'),
    name: 'CAFÉ LATTE',
    yieldQty: 1, yieldUnit: 'EACH', prepTime: 5,
    instructions: '18G DOSE, 36G YIELD IN 25 SEC. STEAM MILK TO 60°C, THIN FOAM, POUR OVER.',
    lines: [
      { item: 'COFFEE BEANS', qty: 18, unit: 'GRAM' },
      { item: 'MILK', qty: 200, unit: 'ML' },
    ],
  },
]

// ── Menu items (linked to recipes; some with WooCommerce link history) ──

interface MenuSpec {
  id: string
  recipe: string
  name: string
  price: number
  wooProductId?: string
  wooCategoryId?: string
  dietary?: string
  description?: string
  shortDescription?: string
}

const MENU_ITEMS: MenuSpec[] = [
  {
    id: MI('01'), recipe: 'HOUSE BURGER', name: 'HOUSE BURGER',
    price: 22.5, wooProductId: '1001',
    dietary: 'GLUTEN, DAIRY, EGGS',
    description: '180G BEEF PATTY, MELTED CHEDDAR, BURGER SAUCE, CRISP LEAVES, TOMATO — TOASTED BUN.',
    shortDescription: '180G BEEF PATTY, MELTED CHEDDAR, HOUSE SAUCE.',
  },
  {
    id: MI('02'), recipe: 'FISH & CHIPS', name: 'FISH & CHIPS',
    price: 26.0, wooProductId: '1002',
    dietary: 'FISH, GLUTEN, EGGS',
    description: 'CRUMBED SNAPPER, TWICE-COOKED CHIPS, TARTARE, LEMON.',
    shortDescription: 'CRUMBED SNAPPER, CHIPS, TARTARE.',
  },
  {
    id: MI('03'), recipe: 'CHICKEN PIE', name: 'CHICKEN PIE',
    price: 18.0,
    dietary: 'GLUTEN, DAIRY, EGGS',
    description: 'CREAMY CHICKEN THIGH FILLING UNDER SHORTCRUST, MASH AND GRAVY.',
    shortDescription: 'CREAMY CHICKEN PIE, MASH, GRAVY.',
  },
  {
    id: MI('04'), recipe: 'GRILLED LAMB RUMP', name: 'GRILLED LAMB RUMP',
    price: 34.5, wooProductId: '1003',
    description: 'ROSEMARY ROAST POTATOES, SALAD, TOMATO SALSA.',
    shortDescription: 'LAMB RUMP, ROAST POTATOES, SALSA.',
  },
  {
    id: MI('05'), recipe: 'CAFÉ LATTE', name: 'CAFÉ LATTE',
    price: 5.5,
    dietary: 'DAIRY',
    description: 'DOUBLE SHOT, STEAMED MILK, THIN FOAM.',
    shortDescription: 'DOUBLE SHOT, STEAMED MILK.',
  },
]

// ── Lookups (find built-ins, create missing ones — same semantics as the API) ──

const BASE_UNIT: Record<string, [string, number]> = {
  EACH: ['ea', 1],
  GRAM: ['g', 1],
  KILOGRAM: ['g', 1000],
  ML: ['mL', 1],
  LITRE: ['mL', 1000],
  'CASE 12': ['ea', 12],
}

async function uomFor(venueId: string, name: string): Promise<string> {
  const found = await prisma.unitOfMeasure.findFirst({
    where: { name, deletedAt: null, OR: [{ venueId: null }, { venueId }] },
    orderBy: { venueId: 'desc' },
  })
  if (found) return found.id
  const [baseUnit, conversionRatio] = BASE_UNIT[name] ?? [name.toLowerCase(), 1]
  const made = await prisma.unitOfMeasure.create({
    data: { name, baseUnit, conversionRatio, isBuiltIn: true, venueId: null },
  })
  return made.id
}

async function categoryFor(venueId: string, name: string): Promise<string> {
  const found = await prisma.inventoryCategory.findFirst({
    where: { name, deletedAt: null, OR: [{ venueId }, { venueId: null }] },
    orderBy: { venueId: 'desc' },
  })
  if (found) return found.id
  const made = await prisma.inventoryCategory.create({
    data: { venueId, name, tab: 'FOOD', isBuiltIn: false, showDeepFields: true },
  })
  return made.id
}

async function main() {
  const venueId = process.argv[2] ?? DEFAULT_VENUE_ID

  const venue = await prisma.venue.findFirst({ where: { id: venueId, deletedAt: null } })
  if (!venue) {
    console.error(`No venue with id ${venueId}. Pass a venue id as the first argument.`)
    process.exitCode = 1
    return
  }

  console.log('=== MOCK RECIPES, MENU ITEMS + INGREDIENTS DATA ===')
  console.log(`Venue: ${venue.name}\n`)

  // ── Units + categories ──
  const unitIds = new Map<string, string>()
  for (const unit of [...new Set([...INGREDIENTS.flatMap((i) => [i.unit, i.orderingUnit, i.countingUnit].filter((u): u is string => !!u)), ...RECIPES.flatMap((r) => [r.yieldUnit, ...r.lines.map((l) => l.unit)])])]) {
    unitIds.set(unit, await uomFor(venueId, unit))
  }
  console.log(`  ${unitIds.size} units of measure ready`)

  const catIds = new Map<string, string>()
  for (const cat of [...new Set(INGREDIENTS.map((i) => i.category))]) {
    catIds.set(cat, await categoryFor(venueId, cat))
  }
  console.log(`  ${catIds.size} inventory categories ready`)

  // ── Ingredients ──
  const itemIds = new Map<string, string>()
  for (const ing of INGREDIENTS) {
    const data = {
      venueId,
      categoryId: catIds.get(ing.category)!,
      name: ing.name,
      unit: ing.unit,
      totalQty: 0,
      defaultParLevel: ing.parLevel,
      costPrice: ing.cost ?? null,
      shelfLifeDays: ing.shelfLife ?? null,
      canFreeze: ing.canFreeze ?? false,
      freezerShelfLifeDays: ing.freezerShelfLife ?? null,
      allergyInfo: ing.allergens ?? null,
      orderingUnitId: ing.orderingUnit ? unitIds.get(ing.orderingUnit) ?? null : null,
      countingUnitId: ing.countingUnit ? unitIds.get(ing.countingUnit) ?? null : null,
      parLevelUnitId: unitIds.get(ing.unit) ?? null,
      deletedAt: null,
    }
    await prisma.inventoryItem.upsert({
      where: { id: ing.id },
      update: data,
      create: { id: ing.id, ...data },
    })
    itemIds.set(ing.name, ing.id)
  }
  console.log(`  ${INGREDIENTS.length} ingredients`)

  // ── Recipes + line items ──
  let lineN = 0
  const recipeIds = new Map<string, string>()
  for (const r of RECIPES) {
    const data = {
      venueId,
      name: r.name,
      yieldQty: r.yieldQty,
      yieldUnitId: unitIds.get(r.yieldUnit)!,
      instructions: r.instructions ?? null,
      prepTime: r.prepTime ?? null,
      isActive: true,
      deletedAt: null,
    }
    await prisma.recipe.upsert({
      where: { id: r.id },
      update: data,
      create: { id: r.id, ...data },
    })
    recipeIds.set(r.name, r.id)

    for (const line of r.lines) {
      const lineId = RLI(String(++lineN))
      const lineData = {
        recipeId: r.id,
        qty: line.qty,
        uomId: unitIds.get(line.unit)!,
        sortOrder: r.lines.indexOf(line),
        inventoryItemId: line.item ? itemIds.get(line.item) ?? null : null,
        childRecipeId: line.recipe ? recipeIds.get(line.recipe) ?? null : null,
        notes: null,
      }
      await prisma.recipeLineItem.upsert({
        where: { id: lineId },
        update: lineData,
        create: { id: lineId, ...lineData },
      })
    }
  }
  console.log(`  ${RECIPES.length} recipes (${RECIPES.flatMap((r) => r.lines).length} line items, ${RECIPES.flatMap((r) => r.lines).filter((l) => l.recipe).length} nested sub-recipe)`)

  // ── Menu items ──
  for (const m of MENU_ITEMS) {
    const data = {
      venueId,
      name: m.name,
      recipeId: recipeIds.get(m.recipe)!,
      price: m.price,
      wooProductId: m.wooProductId ?? null,
      wooCategoryId: m.wooCategoryId ?? null,
      imageUrl: null,
      description: m.description ?? null,
      shortDescription: m.shortDescription ?? null,
      isVariable: false,
      variations: Prisma.JsonNull,
      dietaryInfo: m.dietary ?? null,
      isActive: true,
      deletedAt: null,
    }
    await prisma.menuItem.upsert({
      where: { id: m.id },
      update: data,
      create: { id: m.id, ...data },
    })
  }
  console.log(`  ${MENU_ITEMS.length} menu items linked to recipes`)

  console.log('\nMock data ready.')
  console.log(`  Recipes + menu:  /admin/recipes`)
  console.log(`  Ingredients:     /admin/inventory  →  FOOD / BEVERAGE tabs`)
}

main()
  .catch((e) => {
    console.error('Mock data failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
