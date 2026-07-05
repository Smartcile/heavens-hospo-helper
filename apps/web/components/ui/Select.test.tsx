import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Select } from '@/components/ui/Select'

const options = [
  { value: 'bar', label: 'BAR' },
  { value: 'kitchen', label: 'KITCHEN' },
]

describe('Select', () => {
  it('renders options', () => {
    const { container } = render(<Select options={options} />)
    const select = container.querySelector('select')
    expect(select).toBeTruthy()
    expect(select!.options.length).toBe(2)
  })

  it('renders with label', () => {
    const { getByText } = render(<Select label="DEPARTMENT" options={options} />)
    expect(getByText('DEPARTMENT')).toBeTruthy()
  })

  it('renders placeholder option', () => {
    const { container } = render(<Select options={options} placeholder="SELECT VENUE" />)
    const select = container.querySelector('select')!
    expect(select.options[0].textContent).toBe('SELECT VENUE')
    expect(select.options[0].disabled).toBe(true)
  })

  it('renders error message', () => {
    const { getByText } = render(<Select options={options} error="Required" />)
    expect(getByText('Required')).toBeTruthy()
  })

  it('forwards onChange events', () => {
    const fn = { handler: () => {} }
    const spy = { called: false }
    fn.handler = () => { spy.called = true }
    const { container } = render(<Select options={options} onChange={fn.handler} />)
    fireEvent.change(container.querySelector('select')!, { target: { value: 'bar' } })
    expect(spy.called).toBe(true)
  })
})
