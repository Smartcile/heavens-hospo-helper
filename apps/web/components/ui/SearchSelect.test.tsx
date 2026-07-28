import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { SearchSelect } from '@/components/ui/SearchSelect'

const options = [
  { value: 'a', label: 'ALPHA' },
  { value: 'b', label: 'BETA' },
]
const groups = [
  { label: 'INGREDIENTS', options: [{ value: 'i1', label: 'FLOUR' }] },
  { label: 'SUB-RECIPES', options: [{ value: 'r1', label: 'SAUCE' }] },
]

describe('SearchSelect', () => {
  it('shows the selected label', () => {
    const { getByDisplayValue } = render(<SearchSelect options={options} value="a" onChange={() => {}} />)
    expect(getByDisplayValue('ALPHA')).toBeTruthy()
  })

  it('opens and lists options on focus', () => {
    const { getByPlaceholderText, getByText } = render(<SearchSelect options={options} value="" onChange={() => {}} placeholder="SEARCH" />)
    fireEvent.focus(getByPlaceholderText('SEARCH'))
    expect(getByText('ALPHA')).toBeTruthy()
    expect(getByText('BETA')).toBeTruthy()
  })

  it('filters by query', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SearchSelect options={options} value="" onChange={() => {}} placeholder="SEARCH" />)
    const input = getByPlaceholderText('SEARCH')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'bet' } })
    expect(getByText('BETA')).toBeTruthy()
    expect(queryByText('ALPHA')).toBeNull()
  })

  it('fires onChange when an option is picked', () => {
    const onChange = vi.fn()
    const { getByPlaceholderText, getByText } = render(<SearchSelect options={options} value="" onChange={onChange} placeholder="SEARCH" />)
    fireEvent.focus(getByPlaceholderText('SEARCH'))
    fireEvent.click(getByText('ALPHA'))
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('renders group headers when using groups', () => {
    const { getByPlaceholderText, getByText } = render(<SearchSelect groups={groups} value="" onChange={() => {}} placeholder="SEARCH" />)
    fireEvent.focus(getByPlaceholderText('SEARCH'))
    expect(getByText('INGREDIENTS')).toBeTruthy()
    expect(getByText('SUB-RECIPES')).toBeTruthy()
    expect(getByText('FLOUR')).toBeTruthy()
  })

  it('clears the value via the × button', () => {
    const onChange = vi.fn()
    const { getByText } = render(<SearchSelect options={options} value="a" onChange={onChange} />)
    fireEvent.click(getByText('×'))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
