import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PinKeypad } from './PinKeypad'

function setup() {
  const onKey = vi.fn()
  const onBackspace = vi.fn()
  const onClear = vi.fn()
  render(<PinKeypad onKey={onKey} onBackspace={onBackspace} onClear={onClear} />)
  return { onKey, onBackspace, onClear }
}

describe('PinKeypad', () => {
  it('renders the numeric keys and edit controls', () => {
    setup()
    expect(screen.getByRole('button', { name: '1' })).toBeDefined()
    expect(screen.getByRole('button', { name: '0' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete last digit' })).toBeDefined()
  })

  it('uses a standard numpad order with 7-8-9 on top', () => {
    setup()
    const digits = screen
      .getAllByRole('button')
      .filter((button) => /^[0-9]$/.test(button.textContent ?? ''))
      .map((button) => button.textContent)
    expect(digits).toEqual(['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'])
  })

  it('reports key, backspace and clear presses', () => {
    const { onKey, onBackspace, onClear } = setup()
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete last digit' }))
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR' }))

    expect(onKey.mock.calls).toEqual([['4'], ['0']])
    expect(onBackspace).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('disables every key when asked', () => {
    render(<PinKeypad onKey={vi.fn()} onBackspace={vi.fn()} onClear={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeDisabled()
  })
})
