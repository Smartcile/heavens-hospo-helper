import { describe, it, expect } from 'vitest'
import {
  describeOrderLineOptions,
  normaliseOrderOptions,
  optionPriceDelta,
  sortOrderOptions,
  toggleOptionSelection,
  validateOptionSelection,
  type OrderLineOption,
} from './order-options'
import type { MenuOptionGroup } from './menu-options'

function groups(): MenuOptionGroup[] {
  return [
    {
      id: 'g-side',
      name: 'SIDE',
      minSelect: 1,
      maxSelect: 1,
      choices: [
        { id: 'c-fries', name: 'FRIES', priceDelta: 0, isDefault: true },
        { id: 'c-salad', name: 'SALAD', priceDelta: 3, isDefault: false },
      ],
    },
    {
      id: 'g-extras',
      name: 'EXTRAS',
      minSelect: 0,
      maxSelect: 2,
      choices: [
        { id: 'c-egg', name: 'EGG', priceDelta: 1.5, isDefault: false },
        { id: 'c-bacon', name: 'BACON', priceDelta: 2, isDefault: false },
        { id: 'c-cheese', name: 'CHEESE', priceDelta: 1, isDefault: false },
      ],
    },
  ]
}

function selected(over: Partial<OrderLineOption> = {}): OrderLineOption {
  return {
    groupId: 'g-side',
    groupName: 'SIDE',
    choiceId: 'c-salad',
    choiceName: 'SALAD',
    priceDelta: 3,
    ...over,
  }
}

describe('normaliseOrderOptions', () => {
  it('uppercases names, clamps deltas and preserves the snapshot shape', () => {
    expect(
      normaliseOrderOptions([
        { groupId: 'g1', groupName: ' side ', choiceId: 'c1', choiceName: ' fries ', priceDelta: '+$3.005' },
      ]),
    ).toEqual([
      { groupId: 'g1', groupName: 'SIDE', choiceId: 'c1', choiceName: 'FRIES', priceDelta: 3.01 },
    ])
  })

  it('drops blank choices and dedupes the same group + choice', () => {
    const out = normaliseOrderOptions([
      { groupId: 'g1', groupName: 'SIDE', choiceId: 'c1', choiceName: 'FRIES' },
      { groupId: 'g1', groupName: 'SIDE', choiceId: 'c1', choiceName: 'FRIES' },
      { groupId: 'g1', groupName: 'SIDE', choiceId: '', choiceName: 'SALAD' },
      { groupId: 'g1', groupName: 'SIDE', choiceId: 'c2', choiceName: '  ' },
    ])
    expect(out).toHaveLength(1)
  })

  it('tolerates non-array input', () => {
    expect(normaliseOrderOptions(null)).toEqual([])
    expect(normaliseOrderOptions({})).toEqual([])
  })
})

describe('optionPriceDelta', () => {
  it('sums the upcharges and rounds to cents', () => {
    expect(optionPriceDelta([selected(), selected({ priceDelta: 1.555 })])).toBe(4.56)
    expect(optionPriceDelta([])).toBe(0)
  })
})

describe('describeOrderLineOptions', () => {
  it('groups choices under their group name', () => {
    expect(
      describeOrderLineOptions([
        selected(),
        selected({ groupId: 'g-extras', groupName: 'EXTRAS', choiceId: 'c-egg', choiceName: 'EGG', priceDelta: 1.5 }),
        selected({ groupId: 'g-extras', groupName: 'EXTRAS', choiceId: 'c-bacon', choiceName: 'BACON', priceDelta: 2 }),
      ]),
    ).toBe('SIDE: SALAD · EXTRAS: EGG, BACON')
  })

  it('returns an empty string with no options', () => {
    expect(describeOrderLineOptions([])).toBe('')
  })
})

describe('toggleOptionSelection', () => {
  it('replaces the choice in a single-select group', () => {
    const current = [selected()]
    const next = toggleOptionSelection(groups(), current, 'g-side', 'c-fries')
    expect(next).toEqual([
      { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-fries', choiceName: 'FRIES', priceDelta: 0 },
    ])
  })

  it('keeps the current choice when it is clicked again (single-select)', () => {
    const current = [selected()]
    expect(toggleOptionSelection(groups(), current, 'g-side', 'c-salad')).toEqual(current)
  })

  it('adds/removes choices up to the multi-select cap', () => {
    let current = toggleOptionSelection(groups(), [], 'g-extras', 'c-egg')
    current = toggleOptionSelection(groups(), current, 'g-extras', 'c-bacon')
    expect(current.map((o) => o.choiceId)).toEqual(['c-egg', 'c-bacon'])

    // At the cap — a third pick is ignored.
    expect(toggleOptionSelection(groups(), current, 'g-extras', 'c-cheese')).toEqual(current)

    // Clicking a selected choice removes it.
    expect(toggleOptionSelection(groups(), current, 'g-extras', 'c-egg').map((o) => o.choiceId)).toEqual(['c-bacon'])
  })

  it('ignores an unknown group or choice', () => {
    expect(toggleOptionSelection(groups(), [], 'nope', 'c-egg')).toEqual([])
    expect(toggleOptionSelection(groups(), [], 'g-extras', 'nope')).toEqual([])
  })
})

describe('sortOrderOptions', () => {
  it('orders by group then choice order', () => {
    const sorted = sortOrderOptions(groups(), [
      selected({ groupId: 'g-extras', groupName: 'EXTRAS', choiceId: 'c-bacon', choiceName: 'BACON', priceDelta: 2 }),
      selected(),
      selected({ groupId: 'g-extras', groupName: 'EXTRAS', choiceId: 'c-egg', choiceName: 'EGG', priceDelta: 1.5 }),
    ])
    expect(sorted.map((o) => o.choiceId)).toEqual(['c-salad', 'c-egg', 'c-bacon'])
  })
})

describe('validateOptionSelection', () => {
  it('fills a single default choice and reports no violations', () => {
    const result = validateOptionSelection(groups(), [])
    expect(result.violations).toEqual([])
    expect(result.resolved.map((o) => o.choiceId)).toEqual(['c-fries'])
  })

  it('enforces a required group with no default', () => {
    const noDefault = groups().map((g) => ({
      ...g,
      choices: g.choices.map((c) => ({ ...c, isDefault: false })),
    }))
    const result = validateOptionSelection(noDefault, [])
    expect(result.violations.map((v) => v.message)).toContain('SIDE — CHOOSE AT LEAST 1')
  })

  it('enforces min and max select', () => {
    const min2 = groups().map((g) =>
      g.id === 'g-side' ? { ...g, minSelect: 2, maxSelect: 2, choices: g.choices.map((c) => ({ ...c, isDefault: false })) } : g,
    )
    expect(validateOptionSelection(min2, [selected()]).violations.map((v) => v.message)).toContain(
      'SIDE — CHOOSE AT LEAST 2',
    )

    expect(
      validateOptionSelection(groups(), [
        selected(),
        selected({ choiceId: 'c-fries', choiceName: 'FRIES', priceDelta: 0 }),
      ]).violations.map((v) => v.message),
    ).toContain('SIDE — CHOOSE AT MOST 1')
  })

  it('rejects an unknown group and an unknown choice', () => {
    const result = validateOptionSelection(groups(), [
      selected({ groupId: 'g-x', groupName: 'MYSTERY', choiceId: 'c-x', choiceName: 'X' }),
      selected({ choiceId: 'c-nope', choiceName: 'NOPE' }),
    ])
    const messages = result.violations.map((v) => v.message)
    expect(messages).toContain('UNKNOWN OPTION GROUP: MYSTERY')
    expect(messages).toContain('SIDE — UNKNOWN OPTION: NOPE')
  })

  it('uses the live group + choice ids and live price delta, not the submitted ones', () => {
    const result = validateOptionSelection(
      groups(),
      [selected({ choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 999 })],
    )
    expect(result.violations).toEqual([])
    expect(result.resolved).toEqual([
      { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
    ])
  })

  it('reports more than one default on a single-select group', () => {
    const bad = groups().map((g) =>
      g.id === 'g-side'
        ? { ...g, choices: g.choices.map((c) => ({ ...c, isDefault: true })) }
        : g,
    )
    expect(validateOptionSelection(bad, []).violations.map((v) => v.message)).toContain(
      'SIDE — ONLY ONE DEFAULT CHOICE IS ALLOWED',
    )
  })

  it('does not 422 an untouched multi-select group with several defaults', () => {
    const multi = groups().map((g) =>
      g.id === 'g-extras'
        ? { ...g, choices: g.choices.map((c) => ({ ...c, isDefault: c.id !== 'c-cheese' })) }
        : g,
    )
    const result = validateOptionSelection(multi, [])
    expect(result.violations).toEqual([])
    // The single-select SIDE group still applies its default; the ambiguous
    // multi-select defaults are left untouched.
    expect(result.resolved.map((o) => o.choiceId)).toEqual(['c-fries'])
  })

  it('resolves a multi-select selection in group + choice order', () => {
    const result = validateOptionSelection(groups(), [
      selected({ groupId: 'g-extras', groupName: 'EXTRAS', choiceId: 'c-bacon', choiceName: 'BACON', priceDelta: 2 }),
      selected(),
    ])
    expect(result.violations).toEqual([])
    expect(result.resolved.map((o) => o.choiceId)).toEqual(['c-salad', 'c-bacon'])
  })
})
