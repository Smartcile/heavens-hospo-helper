import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReferenceTableEditor, type ReferenceRowDraft, type ReferenceProductOption } from '@/components/admin/ReferenceTableEditor'
import type { ReferenceColumn } from '@/lib/reference-table'

const PRODUCTS: ReferenceProductOption[] = [
  {
    value: 'm1', label: 'SAUVIGNON BLANC — $14.00', name: 'SAUVIGNON BLANC',
    price: 14, description: 'Crisp', imageUrl: '/w.png', dietaryInfo: 'SULPHITES',
  },
]

const COLUMNS: ReferenceColumn[] = [
  { key: 'item', label: 'ITEM', type: 'MENU_ITEM' },
  { key: 'price', label: 'PRICE', type: 'MENU_FIELD', menuField: 'PRICE' },
  { key: 'tasting', label: 'TASTING', type: 'LONG_TEXT' },
]

const ROWS: ReferenceRowDraft[] = [{ id: 'r1', menuItemId: 'm1', cells: { tasting: 'Citrus' } }]

function setup(over: Partial<React.ComponentProps<typeof ReferenceTableEditor>> = {}) {
  const onColumnsChange = vi.fn()
  const onRowsChange = vi.fn()
  render(
    <ReferenceTableEditor
      columns={COLUMNS}
      rows={ROWS}
      products={PRODUCTS}
      onColumnsChange={onColumnsChange}
      onRowsChange={onRowsChange}
      {...over}
    />,
  )
  return { onColumnsChange, onRowsChange }
}

describe('ReferenceTableEditor', () => {
  it('renders the linked product name and derived product fields', () => {
    setup()
    expect(screen.getByText('SAUVIGNON BLANC')).toBeTruthy() // MENU_ITEM derives from the product
    expect(screen.getByText('$14.00')).toBeTruthy() // MENU_FIELD derives from the product
    expect(screen.getByLabelText('TASTING for item 1')).toHaveValue('Citrus')
  })

  it('edits a manual cell', () => {
    const { onRowsChange } = setup()
    fireEvent.change(screen.getByLabelText('TASTING for item 1'), { target: { value: 'Oak' } })
    expect(onRowsChange).toHaveBeenCalledWith([
      { id: 'r1', menuItemId: 'm1', cells: { tasting: 'Oak' } },
    ])
  })

  it('links a product to a row', () => {
    const { onRowsChange } = setup({ rows: [{ id: null, menuItemId: null, cells: {} }] })
    fireEvent.change(screen.getByLabelText('Product for item 1'), { target: { value: 'm1' } })
    expect(onRowsChange).toHaveBeenCalledWith([{ id: null, menuItemId: 'm1', cells: {} }])
  })

  it('adds an item and a column', () => {
    const { onColumnsChange, onRowsChange } = setup()
    fireEvent.click(screen.getByText('+ ADD ITEM'))
    expect(onRowsChange).toHaveBeenCalledWith([...ROWS, { id: null, menuItemId: null, cells: {} }])
    fireEvent.click(screen.getByText('+ ADD COLUMN'))
    expect(onColumnsChange).toHaveBeenCalled()
  })

  it('notes the shared image on a product-image column', () => {
    setup({ columns: [{ key: 'image', label: 'IMAGE', type: 'MENU_FIELD', menuField: 'IMAGE' }] })
    expect(screen.getByText('SHARED WITH THE PRODUCT')).toBeTruthy()
  })
})
