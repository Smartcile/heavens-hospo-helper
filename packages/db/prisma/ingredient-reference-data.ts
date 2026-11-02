/**
 * Built-in ingredient reference data — the known-density library that answers
 * "how many grams is 1 cup of X?" without the user doing the math.
 *
 * Density values are common cooking references, on a METRIC cup basis
 * (1 cup = 250 mL, 1 tbsp = 20 mL, 1 tsp = 5 mL). `notes` gives the human
 * summary ("1 CUP ≈ 132G"). weightPerUnitGrams covers items sold/used as a
 * whole (eggs, lemons, potatoes...).
 *
 * Imported by both migrate-uom-kind.ts (existing installs) and seed.ts
 * (fresh installs) so the library is seeded everywhere.
 */

export type IngredientSeed = {
  name: string
  densityGramsPerMl?: number
  weightPerUnitGrams?: number
  notes?: string
}

export const INGREDIENT_REFERENCES: IngredientSeed[] = [
  // ── FLOURS ──
  { name: 'FLOUR - 00', densityGramsPerMl: 0.528, notes: '1 CUP ≈ 132G' },
  { name: 'FLOUR - SELF RAISING', densityGramsPerMl: 0.528, notes: '1 CUP ≈ 132G' },
  { name: 'FLOUR - PLAIN', densityGramsPerMl: 0.529, notes: '1 CUP ≈ 132G' },
  { name: 'FLOUR - BREAD', densityGramsPerMl: 0.55, notes: '1 CUP ≈ 137G' },
  { name: 'FLOUR - CAKE', densityGramsPerMl: 0.48, notes: '1 CUP ≈ 120G' },
  { name: 'FLOUR - WHOLE WHEAT', densityGramsPerMl: 0.507, notes: '1 CUP ≈ 127G' },
  { name: 'FLOUR - RYE', densityGramsPerMl: 0.43, notes: '1 CUP ≈ 108G' },
  { name: 'FLOUR - RICE', densityGramsPerMl: 0.56, notes: '1 CUP ≈ 140G' },
  { name: 'CORNSTARCH', densityGramsPerMl: 0.54, notes: '1 CUP ≈ 135G' },
  { name: 'SEMOLINA', densityGramsPerMl: 0.6, notes: '1 CUP ≈ 150G' },
  { name: 'BREADCRUMBS - PANKO', densityGramsPerMl: 0.3, notes: '1 CUP ≈ 75G' },
  // ── SUGARS ──
  { name: 'SUGAR - GRANULATED', densityGramsPerMl: 0.845, notes: '1 CUP ≈ 211G' },
  { name: 'SUGAR - CASTER', densityGramsPerMl: 0.82, notes: '1 CUP ≈ 205G' },
  { name: 'SUGAR - BROWN', densityGramsPerMl: 0.93, notes: '1 CUP ≈ 233G' },
  { name: 'SUGAR - ICING', densityGramsPerMl: 0.507, notes: '1 CUP ≈ 127G' },
  { name: 'SUGAR - DEMERARA', densityGramsPerMl: 0.88, notes: '1 CUP ≈ 220G' },
  { name: 'SUGAR - POWDERED', densityGramsPerMl: 0.507, notes: '1 CUP ≈ 127G' },
  // ── FATS & OILS ──
  { name: 'BUTTER', densityGramsPerMl: 0.96, notes: '1 CUP ≈ 240G · 1 EA (250G BLOCK) = 250G' },
  { name: 'MARGARINE', densityGramsPerMl: 0.95, notes: '1 CUP ≈ 238G' },
  { name: 'OIL - OLIVE', densityGramsPerMl: 0.91, notes: '1 CUP ≈ 228G' },
  { name: 'OIL - VEGETABLE', densityGramsPerMl: 0.91, notes: '1 CUP ≈ 228G' },
  { name: 'OIL - CANOLA', densityGramsPerMl: 0.91, notes: '1 CUP ≈ 228G' },
  { name: 'OIL - COCONUT', densityGramsPerMl: 0.92, notes: '1 CUP ≈ 230G' },
  { name: 'OIL - SESAME', densityGramsPerMl: 0.92, notes: '1 CUP ≈ 230G' },
  { name: 'OIL - PEANUT', densityGramsPerMl: 0.91, notes: '1 CUP ≈ 228G' },
  // ── DAIRY ──
  { name: 'MILK', densityGramsPerMl: 1.03, notes: '1 CUP ≈ 258G' },
  { name: 'MILK - EVAPORATED', densityGramsPerMl: 1.06, notes: '1 CUP ≈ 265G' },
  { name: 'CREAM - THICKENING 35%', densityGramsPerMl: 1.0, notes: '1 CUP ≈ 250G' },
  { name: 'CREAM - WHIPPING', densityGramsPerMl: 0.99, notes: '1 CUP ≈ 248G' },
  { name: 'CREAM - SOUR', densityGramsPerMl: 1.01, notes: '1 CUP ≈ 253G' },
  { name: 'CREAM CHEESE', densityGramsPerMl: 1.02, notes: '1 CUP ≈ 255G' },
  { name: 'YOGHURT - PLAIN', densityGramsPerMl: 1.03, notes: '1 CUP ≈ 258G' },
  { name: 'BUTTERMILK', densityGramsPerMl: 1.03, notes: '1 CUP ≈ 258G' },
  { name: 'CHEESE - PARMESAN GRATED', densityGramsPerMl: 0.44, notes: '1 CUP ≈ 110G' },
  { name: 'CHEESE - MOZZARELLA SHREDDED', densityGramsPerMl: 0.4, notes: '1 CUP ≈ 100G' },
  // ── EGGS ──
  { name: 'EGG', densityGramsPerMl: 1.03, weightPerUnitGrams: 50, notes: '1 EA ≈ 50G' },
  { name: 'EGG YOLK', densityGramsPerMl: 1.03, weightPerUnitGrams: 20, notes: '1 EA ≈ 20G' },
  { name: 'EGG WHITE', densityGramsPerMl: 1.04, weightPerUnitGrams: 30, notes: '1 EA ≈ 30G' },
  // ── GRAINS, RICE & PULSES ──
  { name: 'RICE - BASMATI (RAW)', densityGramsPerMl: 0.78, notes: '1 CUP ≈ 195G' },
  { name: 'RICE - ARBORIO (RAW)', densityGramsPerMl: 0.78, notes: '1 CUP ≈ 195G' },
  { name: 'RICE - SUSHI (RAW)', densityGramsPerMl: 0.8, notes: '1 CUP ≈ 200G' },
  { name: 'RICE - BROWN (RAW)', densityGramsPerMl: 0.78, notes: '1 CUP ≈ 195G' },
  { name: 'OATS - ROLLED', densityGramsPerMl: 0.34, notes: '1 CUP ≈ 85G' },
  { name: 'QUINOA (RAW)', densityGramsPerMl: 0.68, notes: '1 CUP ≈ 170G' },
  { name: 'COUSCOUS (RAW)', densityGramsPerMl: 0.6, notes: '1 CUP ≈ 150G' },
  { name: 'LENTILS - DRY', densityGramsPerMl: 0.8, notes: '1 CUP ≈ 200G' },
  { name: 'CHICKPEAS - DRIED', densityGramsPerMl: 0.8, notes: '1 CUP ≈ 200G' },
  { name: 'PASTA - DRY', densityGramsPerMl: 0.6, notes: '1 CUP ≈ 150G' },
  // ── LEAVENERS, SPICES & PANTRY ──
  { name: 'BAKING POWDER', densityGramsPerMl: 0.81, notes: '1 TSP ≈ 4G' },
  { name: 'BAKING SODA', densityGramsPerMl: 0.93, notes: '1 TSP ≈ 4.6G' },
  { name: 'YEAST - DRY', densityGramsPerMl: 0.61, notes: '1 TSP ≈ 3G' },
  { name: 'SALT - TABLE', densityGramsPerMl: 1.22, notes: '1 TSP ≈ 6G' },
  { name: 'SALT - FLAKY', densityGramsPerMl: 0.55, notes: '1 TSP ≈ 2.7G' },
  { name: 'PEPPER - BLACK GROUND', densityGramsPerMl: 0.5, notes: '1 TSP ≈ 2.5G' },
  { name: 'VANILLA EXTRACT', densityGramsPerMl: 0.9, notes: '1 TSP ≈ 4.5G' },
  { name: 'COCOA POWDER', densityGramsPerMl: 0.42, notes: '1 CUP ≈ 105G' },
  { name: 'ALMOND MEAL', densityGramsPerMl: 0.38, notes: '1 CUP ≈ 95G' },
  { name: 'DESICCATED COCONUT', densityGramsPerMl: 0.35, notes: '1 CUP ≈ 88G' },
  { name: 'COFFEE - GROUND', densityGramsPerMl: 0.4, notes: '1 CUP ≈ 100G' },
  // ── SWEET & FLAVOUR ──
  { name: 'HONEY', densityGramsPerMl: 1.42, notes: '1 CUP ≈ 355G' },
  { name: 'MAPLE SYRUP', densityGramsPerMl: 1.33, notes: '1 CUP ≈ 333G' },
  { name: 'GOLDEN SYRUP', densityGramsPerMl: 1.36, notes: '1 CUP ≈ 340G' },
  { name: 'JAM', densityGramsPerMl: 1.33, notes: '1 CUP ≈ 333G' },
  { name: 'CHOCOLATE - DARK', densityGramsPerMl: 1.1, notes: '1 CUP ≈ 275G' },
  { name: 'CHOCOLATE - MILK', densityGramsPerMl: 1.08, notes: '1 CUP ≈ 270G' },
  { name: 'CHOCOLATE CHIPS', densityGramsPerMl: 0.6, notes: '1 CUP ≈ 150G' },
  { name: 'PEANUT BUTTER', densityGramsPerMl: 1.1, notes: '1 CUP ≈ 275G' },
  { name: 'TAHINI', densityGramsPerMl: 1.1, notes: '1 CUP ≈ 275G' },
  // ── SAVOURY / WET ──
  { name: 'STOCK - CHICKEN', densityGramsPerMl: 1.0, notes: '1 CUP ≈ 250G' },
  { name: 'STOCK - BEEF', densityGramsPerMl: 1.0, notes: '1 CUP ≈ 250G' },
  { name: 'STOCK - VEGETABLE', densityGramsPerMl: 1.0, notes: '1 CUP ≈ 250G' },
  { name: 'TOMATO - PASSATA', densityGramsPerMl: 1.03, notes: '1 CUP ≈ 258G' },
  { name: 'TOMATO - PASTE', densityGramsPerMl: 1.24, notes: '1 CUP ≈ 310G' },
  { name: 'MAYONNAISE', densityGramsPerMl: 0.91, notes: '1 CUP ≈ 228G' },
  { name: 'MUSTARD - DIJON', densityGramsPerMl: 1.2, notes: '1 TSP ≈ 6G' },
  { name: 'SOY SAUCE', densityGramsPerMl: 1.12, notes: '1 CUP ≈ 280G' },
  { name: 'WORCESTERSHIRE SAUCE', densityGramsPerMl: 1.16, notes: '1 CUP ≈ 290G' },
  { name: 'VINEGAR', densityGramsPerMl: 1.0, notes: '1 CUP ≈ 250G' },
  { name: 'WINE - WHITE', densityGramsPerMl: 0.99, notes: '1 CUP ≈ 248G' },
  // ── PRODUCE (count-based — weight per unit) ──
  { name: 'LEMON', weightPerUnitGrams: 100, notes: '1 EA ≈ 100G' },
  { name: 'LIME', weightPerUnitGrams: 60, notes: '1 EA ≈ 60G' },
  { name: 'GARLIC - CLOVE', weightPerUnitGrams: 4, notes: '1 CLOVE ≈ 4G' },
  { name: 'ONION - BROWN', weightPerUnitGrams: 150, notes: '1 EA ≈ 150G' },
  { name: 'POTATO', weightPerUnitGrams: 200, notes: '1 EA ≈ 200G' },
  { name: 'TOMATO - CHERRY', weightPerUnitGrams: 15, notes: '1 EA ≈ 15G' },
  { name: 'AVOCADO', weightPerUnitGrams: 150, notes: '1 EA ≈ 150G' },
]