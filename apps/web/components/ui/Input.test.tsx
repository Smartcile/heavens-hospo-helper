import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Input } from '@/components/ui/Input'

describe('Input', () => {
  it('renders without label', () => {
    const { container } = render(<Input placeholder="TYPE HERE" />)
    const input = container.querySelector('input')
    expect(input).toBeTruthy()
    expect(input?.getAttribute('placeholder')).toBe('TYPE HERE')
  })

  it('renders with label', () => {
    const { getByText, container } = render(<Input label="NAME" />)
    expect(getByText('NAME')).toBeTruthy()
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('renders error message', () => {
    const { getByText } = render(<Input label="NAME" error="Required" />)
    expect(getByText('Required')).toBeTruthy()
  })

  it('applies error border class', () => {
    const { container } = render(<Input error="bad" />)
    expect(container.querySelector('input')?.className).toContain('border-danger')
  })

  it('forwards onChange events', () => {
    const fn = { handler: () => {} }
    const spy = { called: false }
    fn.handler = () => { spy.called = true }
    const { container } = render(<Input onChange={fn.handler} />)
    fireEvent.change(container.querySelector('input')!, { target: { value: 'test' } })
    expect(spy.called).toBe(true)
  })
})
