import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuLineEditor } from '@/components/admin/MenuLineEditor'
import type { MenuLineDraft } from '@/lib/menu-lines'

const LINE: MenuLineDraft = {
  key: 'k1',
  id: 'l1',
  kind: 'PRODUCT',
  menuItemId: 'p1',
  groupKey: null,
  name: 'MARGARITA',
  price: 21,
  dietaryInfo: null,
  isActive: true,
  unit: null,
  sizes: [{ label: 'SINGLE', price: 19 }],
  sizesDirty: false,
  minQty: '',
  maxQty: '',
}

function renderEditor(cogs: { cost: number; partial: boolean } | null, onPatch = vi.fn()) {
  render(
    <MenuLineEditor
      line={LINE}
      groupOptions={[{ value: '', label: 'NO GROUP' }]}
      cogs={cogs}
      onPatch={onPatch}
      onClose={() => {}}
    />,
  )
  return onPatch
}

describe('MenuLineEditor', () => {
  it('shows COGS, the ex-GST price and the margin', () => {
    renderEditor({ cost: 5, partial: false })
    // $21 incl → $18.26 ex-GST → margin (18.26 - 5) / 18.26 ≈ 73%
    expect(screen.getByText('$5.00')).toBeTruthy()
    expect(screen.getByText('$18.26')).toBeTruthy()
    expect(screen.getByText('73%')).toBeTruthy()
  })

  it('flags a partial COGS', () => {
    renderEditor({ cost: 5, partial: true })
    expect(screen.getByText('~ SOME INGREDIENTS HAVE NO COST PRICE')).toBeTruthy()
  })

  it('patches the base price when edited', () => {
    const onPatch = renderEditor(null)
    fireEvent.change(screen.getByDisplayValue('21'), { target: { value: '25' } })
    expect(onPatch).toHaveBeenCalledWith('k1', expect.objectContaining({ price: 25 }))
  })
})
