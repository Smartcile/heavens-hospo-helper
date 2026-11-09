import { describe, it, expect } from 'vitest'
import {
  matchRecipeRows,
  parseRecipeImportAnswer,
  resolveRecipeImportRefs,
  unitKindMismatch,
  type RecipeImportRefs,
} from './recipe'

const answer = JSON.stringify({
  recipes: [
    {
      name: 'roast chicken',
      yieldQty: 4,
      yieldUnit: 'PORTION',
      prepTime: 90,
      instructions: 'Roast it.',
      lines: [
        { target: 'ITEM', name: 'chicken whole', qty: 1.5, uom: 'kg' },
        { target: 'PANTRY', name: 'salt', qty: 10, uom: 'g' },
      ],
    },
  ],
})

function refs(overrides: Partial<RecipeImportRefs> = {}): RecipeImportRefs {
  return {
    items: [
      { id: 'i1', name: 'CHICKEN WHOLE', unit: 'KG' },
      { id: 'i2', name: 'EGG', unit: 'EA', weightPerUnitGrams: 50 },
    ],
    recipes: [{ id: 'r1', name: 'SAUCE', yieldUnitKind: 'COUNT' }],
    uoms: [
      { id: 'u-kg', name: 'KG', baseUnit: 'g', conversionRatio: 1000, kind: 'MASS' },
      { id: 'u-g', name: 'G', baseUnit: 'g', conversionRatio: 1, kind: 'MASS' },
      { id: 'u-ea', name: 'EA', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' },
      { id: 'u-l', name: 'L', baseUnit: 'ml', conversionRatio: 1000, kind: 'VOLUME' },
      { id: 'u-portion', name: 'PORTION', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' },
    ],
    pantry: [{ id: 'p1', name: 'SALT' }],
    ...overrides,
  }
}

describe('parseRecipeImportAnswer', () => {
  it('parses a fenced answer into recipe rows', () => {
    const result = parseRecipeImportAnswer('Here you go\n```json\n' + answer + '\n```')
    if ('error' in result) throw new Error(result.error)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row.values.name).toBe('ROAST CHICKEN')
    expect(row.values.yieldQty).toBe(4)
    expect(row.values.yieldUnit).toBe('PORTION')
    expect(row.values.prepTime).toBe(90)
    expect(row.values.replaceLines).toBe(false)
    expect(row.values.lines).toEqual([
      { target: 'ITEM', name: 'CHICKEN WHOLE', qty: 1.5, uom: 'KG' },
      { target: 'PANTRY', name: 'SALT', qty: 10, uom: 'G' },
    ])
    expect(row.action).toBe('CREATE')
    expect(row.include).toBe(true)
  })

  it('flags an in-file duplicate and keeps only the first', () => {
    const result = parseRecipeImportAnswer(JSON.stringify({
      recipes: [
        { name: 'SAUCE', yieldUnit: 'L', lines: [] },
        { name: 'sauce', yieldUnit: 'L', lines: [] },
      ],
    }))
    if ('error' in result) throw new Error(result.error)
    expect(result.rows[1].match?.status).toBe('DUPLICATE_IN_FILE')
    expect(result.rows[1].action).toBe('SKIP')
    expect(result.rows[1].include).toBe(false)
  })

  it('errors when the answer has no JSON or no recipes', () => {
    expect(parseRecipeImportAnswer('no json here')).toEqual({ error: 'NO JSON FOUND IN THE ANSWER' })
    expect(parseRecipeImportAnswer('{"recipes": []}')).toEqual({ error: 'NO RECIPES FOUND IN THE ANSWER' })
    expect(parseRecipeImportAnswer('{ not json }')).toEqual({ error: 'THE ANSWER IS NOT VALID JSON' })
  })

  it('flags a missing yield unit as a row error', () => {
    const result = parseRecipeImportAnswer(JSON.stringify({ recipes: [{ name: 'SAUCE', lines: [] }] }))
    if ('error' in result) throw new Error(result.error)
    expect(result.rows[0].issues.some((i) => i.code === 'YIELD_UNIT_MISSING' && i.severity === 'ERROR')).toBe(true)
  })
})

describe('matchRecipeRows', () => {
  const existing = [
    { id: 'e1', name: 'SAUCE' },
    { id: 'e2', name: 'GRAVY' },
    { id: 'e3', name: 'GRAVY' },
  ]

  it('defaults an exact single match to SKIP/MATCH', () => {
    const rows = parseAndRows([{ name: 'sauce', yieldUnit: 'L', lines: [] }])
    const matched = matchRecipeRows(rows, existing)
    expect(matched[0].action).toBe('SKIP')
    expect(matched[0].include).toBe(false)
    expect(matched[0].match).toMatchObject({ status: 'MATCH', targetId: 'e1' })
  })

  it('marks duplicate existing names AMBIGUOUS and flags an error', () => {
    const rows = parseAndRows([{ name: 'GRAVY', yieldUnit: 'L', lines: [] }])
    const matched = matchRecipeRows(rows, existing)
    expect(matched[0].match?.status).toBe('AMBIGUOUS')
    expect(matched[0].issues.some((i) => i.code === 'AMBIGUOUS_NAME')).toBe(true)
  })

  it('marks a near copy SIMILAR', () => {
    const rows = parseAndRows([{ name: 'CHICKEN WINGS', yieldUnit: 'L', lines: [] }])
    const matched = matchRecipeRows(rows, [{ id: 'e2', name: 'CHICKEN WING' }])
    expect(matched[0].match?.status).toBe('SIMILAR')
  })
})

describe('resolveRecipeImportRefs', () => {
  it('resolves known names and keeps the row importable', () => {
    const rows = parseAndRows([{
      name: 'ROAST',
      yieldUnit: 'PORTION',
      lines: [
        { target: 'ITEM', name: 'chicken whole', qty: 1.5, uom: 'KG' },
        { target: 'RECIPE', name: 'sauce', qty: 2, uom: 'EA' },
        { target: 'PANTRY', name: 'salt', qty: 10, uom: 'G' },
      ],
    }])
    const resolved = resolveRecipeImportRefs(rows, refs())
    expect(resolved[0].issues).toHaveLength(0)
    expect(resolved[0].action).toBe('CREATE')
  })

  it('flags an unknown line target as an error and skips the row', () => {
    const rows = parseAndRows([{ name: 'ROAST', yieldUnit: 'PORTION', lines: [{ target: 'ITEM', name: 'MYSTERY', qty: 1, uom: 'G' }] }])
    const resolved = resolveRecipeImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'LINE_TARGET_NOT_FOUND' && i.severity === 'ERROR')).toBe(true)
    expect(resolved[0].action).toBe('SKIP')
    expect(resolved[0].include).toBe(false)
  })

  it('flags an unknown unit', () => {
    const rows = parseAndRows([{ name: 'ROAST', yieldUnit: 'PORTION', lines: [{ target: 'ITEM', name: 'CHICKEN WHOLE', qty: 1, uom: 'WIDGET' }] }])
    const resolved = resolveRecipeImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'LINE_UOM_NOT_FOUND')).toBe(true)
  })

  it('flags an unknown yield unit', () => {
    const rows = parseAndRows([{ name: 'ROAST', yieldUnit: 'BUCKET', lines: [] }])
    const resolved = resolveRecipeImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'YIELD_UNIT_NOT_FOUND')).toBe(true)
    expect(resolved[0].action).toBe('SKIP')
  })

  it('flags a unit-dimension mismatch and skips the row', () => {
    // EGG is COUNT; L is VOLUME with no volume bridge on the item.
    const rows = parseAndRows([{ name: 'OMELETTE', yieldUnit: 'PORTION', lines: [{ target: 'ITEM', name: 'EGG', qty: 1, uom: 'L' }] }])
    const resolved = resolveRecipeImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'LINE_UNIT_MISMATCH')).toBe(true)
    expect(resolved[0].action).toBe('SKIP')
  })
})

describe('unitKindMismatch', () => {
  const uom = { id: 'u-l', name: 'L', baseUnit: 'ml', conversionRatio: 1000, kind: 'VOLUME' }
  const uoms = [
    uom,
    { id: 'u-ea', name: 'EA', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' },
  ]

  it('allows a MASS unit on a MASS item', () => {
    expect(unitKindMismatch({ target: 'ITEM', uom, item: { id: 'i', name: 'FLOUR', unit: 'KG' }, uoms })).toBeNull()
  })

  it('blocks a VOLUME unit on a COUNT item without a bridge', () => {
    expect(unitKindMismatch({ target: 'ITEM', uom, item: { id: 'i', name: 'EGG', unit: 'EA' }, uoms })).toContain('UNIT MISMATCH')
  })

  it('never checks a pantry line', () => {
    expect(unitKindMismatch({ target: 'PANTRY', uom, uoms })).toBeNull()
  })
})

function parseAndRows(recipes: unknown[]) {
  const result = parseRecipeImportAnswer(JSON.stringify({ recipes }))
  if ('error' in result) throw new Error(result.error)
  return result.rows
}
