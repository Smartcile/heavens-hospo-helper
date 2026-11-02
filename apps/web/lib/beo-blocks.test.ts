import { describe, it, expect } from 'vitest'
import {
  BEO_BLOCKS,
  BEO_BLOCK_TYPES,
  BEO_BLOCK_GROUPS,
  blockDef,
  blockLabel,
  defaultConfigFor,
  normaliseConfig,
  invalidBlockTypes,
  mergeLibrary,
  libraryGroups,
  isBuiltInType,
  sanitiseFields,
  defRowToBlockDef,
  makeBlock,
  moveBlock,
  summariseBlock,
  type BeoBlockDef,
  type BeoFieldKind,
} from '@/lib/beo-blocks'

const CUSTOM_DEF: BeoBlockDef = {
  type: 'BAR_TAB',
  label: 'BAR TAB',
  group: 'CUSTOM',
  description: 'BAR TAB DETAILS.',
  defaultConfig: { limit: 0, notes: '' },
  fields: [
    { key: 'limit', label: 'LIMIT', kind: 'number' },
    { key: 'notes', label: 'NOTES', kind: 'textarea' },
  ],
}

const LIB = mergeLibrary([CUSTOM_DEF])

const VALID_KINDS: BeoFieldKind[] = ['text', 'textarea', 'number', 'select', 'menu', 'setup', 'items', 'rows']

describe('BEO block library integrity', () => {
  it('has unique block types', () => {
    expect(new Set(BEO_BLOCK_TYPES).size).toBe(BEO_BLOCK_TYPES.length)
  })

  it('every block has a label, a known group and a description', () => {
    for (const b of BEO_BLOCKS) {
      expect(b.label, b.type).toBeTruthy()
      expect(b.description, b.type).toBeTruthy()
      expect(BEO_BLOCK_GROUPS as readonly string[]).toContain(b.group)
    }
  })

  it('every field key is unique within its block and uses a known kind', () => {
    for (const b of BEO_BLOCKS) {
      const keys = b.fields.map((f) => f.key)
      expect(new Set(keys).size, b.type).toBe(keys.length)
      for (const f of b.fields) expect(VALID_KINDS, `${b.type}.${f.key}`).toContain(f.kind)
    }
  })

  // A non-bound field must have a default, or a new block renders undefined.
  it('defaults every non-bound field', () => {
    for (const b of BEO_BLOCKS) {
      for (const f of b.fields) {
        if (f.eventField) continue
        expect(f.key in b.defaultConfig, `${b.type}.${f.key}`).toBe(true)
      }
    }
  })

  it('gives rows fields a column spec', () => {
    for (const b of BEO_BLOCKS) {
      for (const f of b.fields) {
        if (f.kind !== 'rows') continue
        expect(f.columns?.length, `${b.type}.${f.key}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('blockDef / blockLabel', () => {
  it('resolves a known type', () => {
    expect(blockDef('MENU_SELECTION')?.label).toBe('MENU SELECTION')
    expect(blockLabel('MENU_SELECTION')).toBe('MENU SELECTION')
  })

  it('falls back to the raw key for an unknown type', () => {
    expect(blockDef('NOPE')).toBeUndefined()
    expect(blockLabel('NOPE')).toBe('NOPE')
  })
})

describe('defaultConfigFor', () => {
  it('returns the declared defaults', () => {
    expect(defaultConfigFor('MENU_SELECTION')).toEqual({ items: [], notes: '' })
  })

  it('returns a fresh clone each call (no shared arrays)', () => {
    const a = defaultConfigFor('MENU_SELECTION')
    ;(a.items as unknown[]).push({ menuItemId: 'x', qty: 1 })
    expect(defaultConfigFor('MENU_SELECTION').items).toEqual([])
  })

  it('returns an empty object for an unknown type', () => {
    expect(defaultConfigFor('NOPE')).toEqual({})
  })
})

describe('normaliseConfig', () => {
  it('backfills missing fields', () => {
    expect(normaliseConfig('MENU_SELECTION', { notes: 'HI' })).toEqual({ notes: 'HI', items: [] })
  })

  it('keeps unknown keys rather than trimming a newer template', () => {
    expect(normaliseConfig('NOTES', { text: 'A', future: 1 })).toMatchObject({ future: 1 })
  })

  it('never injects bound (event) fields into the config', () => {
    const cfg = normaliseConfig('CUSTOMER_DETAILS', {})
    expect(cfg).not.toHaveProperty('contactName')
    expect(cfg).toHaveProperty('billingNotes')
  })

  it('tolerates a null/garbage config', () => {
    expect(normaliseConfig('NOTES', null)).toEqual({ text: '' })
    expect(normaliseConfig('NOPE', null)).toEqual({})
  })
})

describe('makeBlock', () => {
  it('creates a block with defaults and the given order', () => {
    const b = makeBlock('NOTES', 3, { id: 'b1' })
    expect(b).toEqual({ id: 'b1', type: 'NOTES', title: null, config: { text: '' }, sortOrder: 3 })
  })
})

describe('moveBlock', () => {
  const blocks = [
    { id: 'a', sortOrder: 0 },
    { id: 'b', sortOrder: 1 },
    { id: 'c', sortOrder: 2 },
  ]

  it('swaps with the next block and resets sortOrder', () => {
    const moved = moveBlock(blocks, 0, 1)
    expect(moved.map((b) => b.id)).toEqual(['b', 'a', 'c'])
    expect(moved.map((b) => b.sortOrder)).toEqual([0, 1, 2])
  })

  it('swaps with the previous block', () => {
    expect(moveBlock(blocks, 2, -1).map((b) => b.id)).toEqual(['a', 'c', 'b'])
  })

  it('is a no-op at the boundaries and for a bad index', () => {
    expect(moveBlock(blocks, 0, -1)).toBe(blocks)
    expect(moveBlock(blocks, 2, 1)).toBe(blocks)
    expect(moveBlock(blocks, 9, 1)).toBe(blocks)
  })
})

describe('summariseBlock', () => {
  it('counts items and rows', () => {
    expect(summariseBlock({ type: 'MENU_SELECTION', config: { items: [1, 2, 3] } })).toBe('3 ITEMS')
    expect(summariseBlock({ type: 'TIMELINE', config: { rows: [{ time: '18:00' }] } })).toBe('1 ROW')
  })

  it('names the empty case', () => {
    expect(summariseBlock({ type: 'MENU_SELECTION', config: { items: [] } })).toBe('NO ITEMS')
    expect(summariseBlock({ type: 'STAFFING', config: { rows: [] } })).toBe('NO ROWS')
  })

  it('falls back to the first scalar value, uppercased', () => {
    expect(summariseBlock({ type: 'NOTES', config: { text: 'hello' } })).toBe('HELLO')
  })

  it('falls back to the description when there is nothing to show', () => {
    expect(summariseBlock({ type: 'HISTORY', config: {} })).toContain('ACTIVITY LOG')
  })
})

describe('custom block library', () => {
  it('merges custom defs after the built-ins and never shadows one', () => {
    const merged = mergeLibrary([CUSTOM_DEF, { ...CUSTOM_DEF, type: 'NOTES', label: 'HIJACK' }])
    expect(merged).toHaveLength(BEO_BLOCKS.length + 1)
    expect(blockDef('BAR_TAB', merged)?.label).toBe('BAR TAB')
    expect(blockDef('NOTES', merged)?.label).toBe('NOTES') // built-in wins
  })

  it('resolves a custom type only when the library is passed', () => {
    expect(blockDef('BAR_TAB')).toBeUndefined()
    expect(blockDef('BAR_TAB', LIB)?.label).toBe('BAR TAB')
    expect(blockLabel('BAR_TAB', LIB)).toBe('BAR TAB')
  })

  it('builds and normalises a custom config', () => {
    expect(defaultConfigFor('BAR_TAB', LIB)).toEqual({ limit: 0, notes: '' })
    expect(normaliseConfig('BAR_TAB', { notes: 'HI' }, LIB)).toEqual({ notes: 'HI', limit: 0 })
  })

  it('validates custom types against the resolved library', () => {
    expect(invalidBlockTypes([{ type: 'BAR_TAB' }], LIB)).toEqual([])
    expect(invalidBlockTypes([{ type: 'BAR_TAB' }])).toEqual(['BAR_TAB'])
  })

  it('summarises a custom block from its library description', () => {
    expect(summariseBlock({ type: 'BAR_TAB', config: {} }, LIB)).toBe('BAR TAB DETAILS.')
    expect(summariseBlock({ type: 'BAR_TAB', config: { notes: 'TAB 4' } }, LIB)).toBe('TAB 4')
  })

  it('lists groups in first-seen order including custom groups', () => {
    expect(libraryGroups(LIB)).toContain('CUSTOM')
    expect(libraryGroups(LIB).slice(0, BEO_BLOCK_GROUPS.length)).toEqual([...BEO_BLOCK_GROUPS])
  })

  it('knows which types are built in', () => {
    expect(isBuiltInType('NOTES')).toBe(true)
    expect(isBuiltInType('BAR_TAB')).toBe(false)
  })
})

describe('sanitiseFields', () => {
  it('drops unknown kinds, blank keys/labels and duplicates', () => {
    const fields = sanitiseFields([
      { key: 'a', label: 'A', kind: 'text' },
      { key: 'a', label: 'DUP', kind: 'text' },
      { key: '', label: 'NO KEY', kind: 'text' },
      { key: 'b', label: '', kind: 'text' },
      { key: 'c', label: 'C', kind: 'menu' },
    ])
    expect(fields.map((f) => f.key)).toEqual(['a'])
  })

  it('keeps valid select options and requires rows to have columns', () => {
    const fields = sanitiseFields([
      {
        key: 'choice',
        label: 'CHOICE',
        kind: 'select',
        options: [
          { value: 'x', label: 'X' },
          { value: '', label: 'BLANK' },
        ],
      },
      { key: 'table', label: 'TABLE', kind: 'rows', columns: [] },
      { key: 'rows', label: 'ROWS', kind: 'rows', columns: [{ key: 'n', label: 'N' }] },
    ])
    expect(fields.find((f) => f.key === 'choice')?.options).toEqual([{ value: 'x', label: 'X' }])
    expect(fields.find((f) => f.key === 'table')).toBeUndefined()
    expect(fields.find((f) => f.key === 'rows')?.columns).toEqual([{ key: 'n', label: 'N', kind: 'text' }])
  })
})

describe('defRowToBlockDef', () => {
  it('maps a row and never produces an eventField', () => {
    const def = defRowToBlockDef({
      key: 'BAR_TAB',
      label: 'BAR TAB',
      group: null,
      description: null,
      defaultConfig: { limit: 0 },
      fields: [{ key: 'limit', label: 'LIMIT', kind: 'number' }],
    })
    expect(def.type).toBe('BAR_TAB')
    expect(def.group).toBe('CUSTOM')
    expect(def.defaultConfig).toEqual({ limit: 0 })
    expect(def.fields.every((f) => !f.eventField)).toBe(true)
  })
})
