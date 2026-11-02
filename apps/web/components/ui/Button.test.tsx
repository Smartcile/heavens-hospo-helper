import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders children', () => {
    const { getByText } = render(<Button>CLICK</Button>)
    expect(getByText('CLICK')).toBeTruthy()
  })

  it('applies primary variant by default', () => {
    const { container } = render(<Button>OK</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('btn-primary')
  })

  it('applies ghost variant', () => {
    const { container } = render(<Button variant="ghost">OK</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('btn-ghost')
  })

  it('applies danger variant', () => {
    const { container } = render(<Button variant="danger">OK</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('btn-danger')
  })

  it('applies the requested size', () => {
    const { container } = render(<Button size="lg">OK</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('btn-lg')
  })

  it('disables when loading', () => {
    const { container, getByText } = render(<Button loading>SAVE</Button>)
    expect(getByText('LOADING')).toBeTruthy()
    const btn = container.querySelector('button')
    expect(btn?.disabled).toBe(true)
  })

  it('disables when disabled prop is set', () => {
    const { container } = render(<Button disabled>OK</Button>)
    const btn = container.querySelector('button')
    expect(btn?.disabled).toBe(true)
  })

  it('calls onClick handler', () => {
    const fn = { handler: () => {} }
    const spy = { called: false }
    fn.handler = () => { spy.called = true }
    const { getByText } = render(<Button onClick={fn.handler}>GO</Button>)
    fireEvent.click(getByText('GO'))
    expect(spy.called).toBe(true)
  })
})
