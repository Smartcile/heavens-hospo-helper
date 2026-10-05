import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReferenceTable, type ReferenceTableRow } from '@/components/ReferenceTable'
import type { ReferenceColumn } from '@/lib/reference-table'

const COLUMNS: ReferenceColumn[] = [
  { key: 'item', label: 'ITEM', type: 'MENU_ITEM' },
  { key: 'price', label: 'PRICE', type: 'MENU_FIELD', menuField: 'PRICE' },
  { key: 'tasting', label: 'TASTING', type: 'LONG_TEXT' },
]

const ROWS: ReferenceTableRow[] = [
  {
    id: 'r1',
    menuItemId: 'm1',
    menuItem: { id: 'm1', name: 'SAUVIGNON BLANC', price: 14, description: 'Crisp', imageUrl: null, dietaryInfo: null },
    cells: { tasting: 'Citrus' },
  },
  {
    id: 'r2',
    menuItemId: null,
    menuItem: null,
    cells: { item: 'HOUSE ROSE', tasting: 'Berry' },
  },
]

describe('ReferenceTable', () => {
  it('renders the item, derived price and manual cells', () => {
    render(<ReferenceTable columns={COLUMNS} rows={ROWS} />)
    // Both the wide table and the phone cards render — hence getAllByText.
    expect(screen.getAllByText('SAUVIGNON BLANC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$14.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Citrus').length).toBeGreaterThan(0)
    expect(screen.getAllByText('HOUSE ROSE').length).toBeGreaterThan(0)
  })

  it('filters rows by the search box', () => {
    render(<ReferenceTable columns={COLUMNS} rows={ROWS} />)
    fireEvent.change(screen.getByPlaceholderText('SEARCH ITEMS…'), { target: { value: 'rose' } })
    expect(screen.getAllByText('HOUSE ROSE').length).toBeGreaterThan(0)
    expect(screen.queryByText('SAUVIGNON BLANC')).toBeNull()
  })

  it('shows an empty state when nothing matches', () => {
    render(<ReferenceTable columns={COLUMNS} rows={ROWS} />)
    fireEvent.change(screen.getByPlaceholderText('SEARCH ITEMS…'), { target: { value: 'zzz' } })
    expect(screen.getByText('NO MATCHING ITEMS.')).toBeTruthy()
  })
})
