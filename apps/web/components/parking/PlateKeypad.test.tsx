import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlateKeypad } from './PlateKeypad'

function setup() {
  const onKey = vi.fn()
  const onBackspace = vi.fn()
  const onClear = vi.fn()
  render(<PlateKeypad onKey={onKey} onBackspace={onBackspace} onClear={onClear} />)
  return { onKey, onBackspace, onClear }
}

describe('PlateKeypad', () => {
  it('renders letters, digits and the edit keys', () => {
    setup()
    expect(screen.getByRole('button', { name: 'A' })).toBeDefined()
    expect(screen.getByRole('button', { name: '0' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete last character' })).toBeDefined()
  })

  it('reports presses, backspace and clear', () => {
    const { onKey, onBackspace, onClear } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Q' }))
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete last character' }))
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR' }))

    expect(onKey.mock.calls).toEqual([['Q'], ['7']])
    expect(onBackspace).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('disables every key when asked', () => {
    render(
      <PlateKeypad onKey={vi.fn()} onBackspace={vi.fn()} onClear={vi.fn()} disabled />,
    )
    expect(screen.getByRole('button', { name: 'A' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeDisabled()
  })
})
