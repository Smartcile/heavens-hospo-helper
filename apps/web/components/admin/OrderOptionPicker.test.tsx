import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { OrderOptionPicker } from './OrderOptionPicker'
import type { MenuOptionGroup } from '@/lib/menu-options'
import type { OrderLineOption } from '@/lib/order-options'

const GROUPS: MenuOptionGroup[] = [
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
    maxSelect: 1,
    choices: [
      { id: 'c-egg', name: 'EGG', priceDelta: 1.5, isDefault: false },
      { id: 'c-bacon', name: 'BACON', priceDelta: 2, isDefault: false },
    ],
  },
]

function Harness({ initial = [] as OrderLineOption[] }) {
  const [value, setValue] = useState<OrderLineOption[]>(initial)
  return (
    <>
      <OrderOptionPicker groups={GROUPS} value={value} onChange={setValue} />
      <div data-testid="summary">{value.map((v) => v.choiceName).join(',')}</div>
    </>
  )
}

describe('OrderOptionPicker', () => {
  it('renders each group and choice', () => {
    render(<OrderOptionPicker groups={GROUPS} value={[]} onChange={() => {}} />)
    expect(screen.getByText('SIDE (CHOOSE 1)')).toBeTruthy()
    expect(screen.getByText('FRIES')).toBeTruthy()
    expect(screen.getByText('SALAD')).toBeTruthy()
    expect(screen.getByText('EXTRAS (OPTIONAL)')).toBeTruthy()
  })

  it('replaces the choice in a single-select group', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /FRIES/ }))
    expect(screen.getByTestId('summary').textContent).toBe('FRIES')
    fireEvent.click(screen.getByRole('button', { name: /SALAD/ }))
    expect(screen.getByTestId('summary').textContent).toBe('SALAD')
  })

  it('calls onChange with a snapshot including the live price delta', () => {
    const onChange = vi.fn()
    render(<OrderOptionPicker groups={GROUPS} value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /SALAD/ }))
    expect(onChange).toHaveBeenCalledWith([
      { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
    ])
  })

  it('shows the summary and the total upcharge', () => {
    render(<Harness initial={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /SALAD/ }))
    fireEvent.click(screen.getByRole('button', { name: /EGG/ }))
    expect(screen.getByText('SIDE: SALAD · EXTRAS: EGG')).toBeTruthy()
    expect(screen.getByText('+$4.50')).toBeTruthy()
  })

  it('renders nothing when the product has no option groups', () => {
    const { container } = render(<OrderOptionPicker groups={[]} value={[]} onChange={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
