import { describe, it, expect } from 'vitest'
import {
  normaliseOptionName,
  normalisePriceDelta,
  normaliseOptionGroups,
  validateOptionGroup,
  validateOptionGroups,
  describeOptionRule,
  describeOptionGroup,
  formatPriceDelta,
  summariseOptionChoices,
  defaultOptionChoice,
  type MenuOptionGroup,
} from './menu-options'

describe('normaliseOptionName', () => {
  it('trims, collapses whitespace and uppercases', () => {
    expect(normaliseOptionName('  side   of   fries ')).toBe('SIDE OF FRIES')
  })
})

describe('normalisePriceDelta', () => {
  it('keeps positive upcharges rounded to cents', () => {
    expect(normalisePriceDelta(3)).toBe(3)
    expect(normalisePriceDelta('+$3.005')).toBe(3.01)
  })

  it('floors zero, negative and invalid values to 0', () => {
    expect(normalisePriceDelta(0)).toBe(0)
    expect(normalisePriceDelta(-2)).toBe(0)
    expect(normalisePriceDelta('x')).toBe(0)
  })
})

describe('normaliseOptionGroups', () => {
  it('uppercases names, preserves ids and sorts by array order', () => {
    expect(
      normaliseOptionGroups([
        {
          id: 'g1',
          name: ' side ',
          minSelect: '1',
          maxSelect: '2',
          choices: [
            { id: 'c1', name: 'fries', priceDelta: '+$3', isDefault: true },
            { name: 'salad' },
          ],
        },
      ]),
    ).toEqual([
      {
        id: 'g1',
        name: 'SIDE',
        minSelect: 1,
        maxSelect: 2,
        sortOrder: 0,
        choices: [
          { id: 'c1', name: 'FRIES', priceDelta: 3, isDefault: true, sortOrder: 0 },
          { name: 'SALAD', priceDelta: 0, isDefault: false, sortOrder: 1 },
        ],
      },
    ])
  })

  it('drops blank names and duplicate unique keys', () => {
    const out = normaliseOptionGroups([
      { name: 'SIDE', choices: [{ name: 'FRIES' }, { name: 'FRIES' }, { name: '  ' }] },
      { name: ' side ', choices: [{ name: 'SALAD' }] },
      { name: '', choices: [{ name: 'X' }] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].choices.map((c) => c.name)).toEqual(['FRIES'])
  })

  it('defaults min/max when absent or invalid', () => {
    const [group] = normaliseOptionGroups([{ name: 'SIDE', choices: [{ name: 'FRIES' }] }])
    expect(group.minSelect).toBe(0)
    expect(group.maxSelect).toBe(1)
  })
})

describe('validateOptionGroup', () => {
  const base = (over: Partial<MenuOptionGroup> = {}): MenuOptionGroup => ({
    name: 'SIDE',
    minSelect: 1,
    maxSelect: 1,
    choices: [
      { name: 'FRIES', priceDelta: 0, isDefault: true },
      { name: 'SALAD', priceDelta: 3, isDefault: false },
    ],
    ...over,
  })

  it('accepts a valid single-select group', () => {
    expect(validateOptionGroup(base())).toEqual([])
  })

  it('rejects a negative min, zero max and min over max', () => {
    expect(validateOptionGroup(base({ minSelect: -1 })).join(' ')).toMatch(/MIN SELECT/)
    expect(validateOptionGroup(base({ maxSelect: 0 })).join(' ')).toMatch(/MAX SELECT MUST BE AT LEAST 1/)
    expect(validateOptionGroup(base({ minSelect: 2, maxSelect: 1 })).join(' ')).toMatch(/MIN SELECT CANNOT EXCEED/)
  })

  it('rejects max select beyond the choice count and an empty group', () => {
    expect(validateOptionGroup(base({ maxSelect: 3 })).join(' ')).toMatch(/NUMBER OF CHOICES/)
    expect(validateOptionGroup(base({ choices: [] })).join(' ')).toMatch(/AT LEAST ONE CHOICE/)
  })

  it('rejects more than one default only when single-select', () => {
    const twoDefaults = [
      { name: 'FRIES', priceDelta: 0, isDefault: true },
      { name: 'SALAD', priceDelta: 0, isDefault: true },
    ]
    expect(validateOptionGroup(base({ choices: twoDefaults })).join(' ')).toMatch(/ONLY ONE DEFAULT/)
    expect(validateOptionGroup(base({ maxSelect: 2, choices: twoDefaults }))).toEqual([])
  })

  it('rejects a negative upcharge', () => {
    const group = base({ choices: [{ name: 'FRIES', priceDelta: -1, isDefault: true }] })
    expect(validateOptionGroup(group).join(' ')).toMatch(/UPCHARGES CANNOT BE NEGATIVE/)
  })

  it('flattens errors across groups', () => {
    expect(validateOptionGroups([base(), base({ name: 'COOKING', choices: [] })])).toHaveLength(1)
  })
})

describe('display helpers', () => {
  it('describes the selection rule', () => {
    expect(describeOptionRule({ minSelect: 0, maxSelect: 1 })).toBe('OPTIONAL')
    expect(describeOptionRule({ minSelect: 1, maxSelect: 1 })).toBe('CHOOSE 1')
    expect(describeOptionRule({ minSelect: 1, maxSelect: 2 })).toBe('CHOOSE 1–2')
    expect(describeOptionRule({ minSelect: 0, maxSelect: 3 })).toBe('UP TO 3')
  })

  it('describes a group heading', () => {
    expect(describeOptionGroup({ name: 'SIDE', minSelect: 1, maxSelect: 1 })).toBe('SIDE (CHOOSE 1)')
    expect(describeOptionGroup({ name: '', minSelect: 0, maxSelect: 1 })).toBe('UNTITLED (OPTIONAL)')
  })

  it('formats deltas with a plus for upcharges', () => {
    expect(formatPriceDelta(3)).toBe('+$3.00')
    expect(formatPriceDelta(0)).toBe('$0.00')
    expect(formatPriceDelta(Number.NaN)).toBe('$0.00')
  })

  it('summarises choices and finds the default', () => {
    const group: MenuOptionGroup = {
      name: 'SIDE',
      minSelect: 1,
      maxSelect: 1,
      choices: [
        { name: 'FRIES', priceDelta: 0, isDefault: false },
        { name: 'SALAD', priceDelta: 3, isDefault: true },
      ],
    }
    expect(summariseOptionChoices(group)).toBe('FRIES $0.00 · SALAD +$3.00')
    expect(defaultOptionChoice(group)?.name).toBe('SALAD')
    expect(defaultOptionChoice({ ...group, choices: [] })).toBeNull()
  })
})
