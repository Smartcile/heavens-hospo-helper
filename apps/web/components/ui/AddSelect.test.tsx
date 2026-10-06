import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AddSelect } from '@/components/ui/AddSelect'

const GROUPS = [
  {
    label: 'DEPARTMENT',
    options: [
      { value: 'd1', label: 'BAR' },
      { value: 'd2', label: 'KITCHEN' },
    ],
  },
  { label: 'POSITION', options: [{ value: 'p1', label: 'DUTY MANAGER' }] },
]

describe('AddSelect', () => {
  it('lists grouped options and fires onAdd when one is picked', () => {
    const onAdd = vi.fn()
    const { getByPlaceholderText, getByText } = render(
      <AddSelect groups={GROUPS} onAdd={onAdd} placeholder="ADD" />,
    )
    fireEvent.focus(getByPlaceholderText('ADD'))
    expect(getByText('DEPARTMENT')).toBeTruthy()
    expect(getByText('BAR')).toBeTruthy()

    fireEvent.click(getByText('BAR'))
    expect(onAdd).toHaveBeenCalledWith('d1')
  })

  it('hides options already added', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <AddSelect groups={GROUPS} selected={['d1']} onAdd={() => {}} placeholder="ADD" />,
    )
    fireEvent.focus(getByPlaceholderText('ADD'))
    expect(queryByText('BAR')).toBeNull()
    expect(getByText('KITCHEN')).toBeTruthy()
  })

  it('filters by search', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <AddSelect groups={GROUPS} onAdd={() => {}} placeholder="ADD" />,
    )
    const input = getByPlaceholderText('ADD')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'kit' } })
    expect(getByText('KITCHEN')).toBeTruthy()
    expect(queryByText('BAR')).toBeNull()
  })

  it('shows the empty label when everything has been added', () => {
    const { getByPlaceholderText, getByText } = render(
      <AddSelect groups={GROUPS} selected={['d1', 'd2', 'p1']} onAdd={() => {}} placeholder="ADD" emptyLabel="ALL ADDED" />,
    )
    fireEvent.focus(getByPlaceholderText('ADD'))
    expect(getByText('ALL ADDED')).toBeTruthy()
  })
})
