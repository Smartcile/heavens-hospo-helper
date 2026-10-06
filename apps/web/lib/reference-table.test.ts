import { describe, it, expect } from 'vitest'
import {
  PRODUCT_REFERENCE_DEFAULT_COLUMNS,
  sanitiseColumns,
  sanitiseCells,
  formatMoney,
  menuFieldValue,
  displayCellText,
  displayCellImage,
  columnIsEditable,
  isDerivedColumn,
  isMenuField,
  mergeMenuRows,
  type ReferenceRowDraftLike,
  type ReferenceMenuItem,
} from './reference-table'

const wine: ReferenceMenuItem = {
  id: 'm1',
  name: 'SAUVIGNON BLANC',
  price: 14,
  description: 'Crisp, citrus-led.',
  imageUrl: '/uploads/wine.png',
  dietaryInfo: 'SULPHITES',
  serveMethod: 'WINE',
  serveSummary: 'GLASS · 150 ML / BOTTLE · 750 ML',
}

describe('sanitiseColumns', () => {
  it('keeps valid columns in order', () => {
    const cols = sanitiseColumns(PRODUCT_REFERENCE_DEFAULT_COLUMNS)
    expect(cols.map((c) => c.key)).toEqual(PRODUCT_REFERENCE_DEFAULT_COLUMNS.map((c) => c.key))
    expect(cols.find((c) => c.key === 'price')?.menuField).toBe('PRICE')
  })

  it('derives a key from the label when missing and de-dupes', () => {
    const cols = sanitiseColumns([
      { label: 'Tasting Notes', type: 'LONG_TEXT' },
      { label: 'Tasting Notes', type: 'LONG_TEXT' },
    ])
    expect(cols.map((c) => c.key)).toEqual(['tasting_notes', 'tasting_notes_2'])
  })

  it('drops unknown types and MENU_FIELD without a field', () => {
    const cols = sanitiseColumns([
      { label: 'BAD', type: 'NOPE' },
      { label: 'NO FIELD', type: 'MENU_FIELD' },
      { label: 'GOOD', type: 'TEXT' },
    ])
    expect(cols.map((c) => c.label)).toEqual(['GOOD'])
  })

  it('keeps options only for SELECT', () => {
    const [sel, txt] = sanitiseColumns([
      { label: 'SIZE', type: 'SELECT', options: ['GLASS', ' BOTTLE ', ''] },
      { label: 'NOTE', type: 'TEXT', options: ['x'] },
    ])
    expect(sel.options).toEqual(['GLASS', 'BOTTLE'])
    expect(txt.options).toBeUndefined()
  })

  it('returns [] for non-arrays', () => {
    expect(sanitiseColumns('nope')).toEqual([])
    expect(sanitiseColumns(null)).toEqual([])
  })
})

describe('sanitiseCells', () => {
  const cols = sanitiseColumns(PRODUCT_REFERENCE_DEFAULT_COLUMNS)

  it('stores manual columns and drops derived ones', () => {
    const cells = sanitiseCells({ equipment: ' WINE GLASS ', tasting: 'OAKY', price: 'ignored' }, cols)
    expect(cells).toEqual({ equipment: 'WINE GLASS', tasting: 'OAKY' })
  })

  it('joins arrays and ignores unknown keys', () => {
    const cells = sanitiseCells({ equipment: ['A', 'B'], nope: 'x' }, cols)
    expect(cells).toEqual({ equipment: 'A, B' })
  })
})

describe('menuFieldValue / displayCellText', () => {
  it('formats price and passes through fields', () => {
    expect(formatMoney(14)).toBe('$14.00')
    expect(menuFieldValue(wine, 'PRICE')).toBe('$14.00')
    expect(menuFieldValue(wine, 'DESCRIPTION')).toBe('Crisp, citrus-led.')
    expect(menuFieldValue(wine, 'DIETARY')).toBe('SULPHITES')
    expect(menuFieldValue(null, 'PRICE')).toBeNull()
  })

  it('resolves the item column from the linked product', () => {
    const col = PRODUCT_REFERENCE_DEFAULT_COLUMNS[0]
    expect(displayCellText({ menuItem: wine, cells: {} }, col)).toBe('SAUVIGNON BLANC')
    expect(displayCellText({ menuItem: null, cells: { item: 'HOUSE RED' } }, col)).toBe('HOUSE RED')
    expect(displayCellText({ menuItem: null, cells: {} }, col)).toBeNull()
  })

  it('reads derived columns from the product, manual from cells', () => {
    const price = PRODUCT_REFERENCE_DEFAULT_COLUMNS[1]
    const equipment = PRODUCT_REFERENCE_DEFAULT_COLUMNS[3]
    const row = { menuItem: wine, cells: { equipment: 'TUMBLER' } }
    expect(displayCellText(row, price)).toBe('$14.00')
    expect(displayCellText(row, equipment)).toBe('TUMBLER')
  })
})

describe('displayCellImage', () => {
  it('derives the image from the product for a MENU_FIELD image column', () => {
    const col = PRODUCT_REFERENCE_DEFAULT_COLUMNS.find((c) => c.key === 'image')!
    expect(displayCellImage({ menuItem: wine, cells: {} }, col)).toBe('/uploads/wine.png')
    expect(displayCellImage({ menuItem: null, cells: {} }, col)).toBeNull()
  })

  it('uses the stored cell for a manual IMAGE column', () => {
    const col = { key: 'photo', label: 'PHOTO', type: 'IMAGE' as const }
    expect(displayCellImage({ menuItem: null, cells: { photo: '/x.png' } }, col)).toBe('/x.png')
  })
})

describe('mergeMenuRows', () => {
  const row = (menuItemId: string | null, extra: Partial<ReferenceRowDraftLike> = {}): ReferenceRowDraftLike => ({
    id: null,
    menuItemId,
    cells: {},
    ...extra,
  })

  it('appends a row for every menu item not already present, in menu order', () => {
    const merged = mergeMenuRows([row('a', { id: 'r1', cells: { note: 'x' } })], ['a', 'b', 'c'])
    expect(merged.map((r) => r.menuItemId)).toEqual(['a', 'b', 'c'])
    expect(merged[0].cells).toEqual({ note: 'x' })
    expect(merged[1]).toEqual({ id: null, menuItemId: 'b', cells: {} })
  })

  it('never removes or reorders existing rows — including off-menu ones', () => {
    const merged = mergeMenuRows([row('off', { id: 'r1' }), row('a', { id: 'r2' })], ['a', 'b'])
    expect(merged.map((r) => r.menuItemId)).toEqual(['off', 'a', 'b'])
  })

  it('returns the same array instance when there is nothing to add', () => {
    const rows = [row('a', { id: 'r1' })]
    expect(mergeMenuRows(rows, ['a'])).toBe(rows)
    expect(mergeMenuRows(rows, [])).toBe(rows)
  })

  it('ignores blank ids and de-dupes an item listed twice', () => {
    const merged = mergeMenuRows([], ['a', 'a', '', 'b'])
    expect(merged.map((r) => r.menuItemId)).toEqual(['a', 'b'])
  })
})

describe('serve columns', () => {
  const method = { key: 'method', label: 'METHOD', type: 'METHOD' as const }
  const size = { key: 'serve', label: 'SERVE', type: 'SERVE' as const }

  it('reads METHOD / SERVE from the product\u2019s serves', () => {
    const row = { menuItem: wine, cells: {} }
    expect(displayCellText(row, method)).toBe('WINE')
    expect(displayCellText(row, size)).toBe('GLASS · 150 ML / BOTTLE · 750 ML')
    expect(displayCellText({ menuItem: null, cells: {} }, method)).toBeNull()
  })

  it('treats METHOD / SERVE as derived — not editable, never stored', () => {
    expect(isDerivedColumn(method)).toBe(true)
    expect(columnIsEditable(method)).toBe(false)
    expect(sanitiseCells({ method: 'IGNORED', serve: 'IGNORED' }, [method, size])).toEqual({})
  })
})

describe('helpers', () => {
  it('isMenuField / columnIsEditable', () => {
    expect(isMenuField('PRICE')).toBe(true)
    expect(isMenuField('NOPE')).toBe(false)
    expect(columnIsEditable(PRODUCT_REFERENCE_DEFAULT_COLUMNS[0])).toBe(true)
    expect(columnIsEditable(PRODUCT_REFERENCE_DEFAULT_COLUMNS[1])).toBe(false)
  })
})
