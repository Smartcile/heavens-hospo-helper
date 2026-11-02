import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { DateInput } from '@/components/ui/DateInput'
import { TimeInput } from '@/components/ui/TimeInput'

describe('DateInput / TimeInput', () => {
  it('DateInput renders a date input carrying the shared .field class', () => {
    const { container } = render(<DateInput value="2026-10-06" onChange={() => {}} />)
    const el = container.querySelector('input')!
    expect(el.getAttribute('type')).toBe('date')
    expect(el.className).toContain('field')
  })

  it('TimeInput renders a time input carrying the shared .field class', () => {
    const { container } = render(<TimeInput value="09:00" onChange={() => {}} />)
    const el = container.querySelector('input')!
    expect(el.getAttribute('type')).toBe('time')
    expect(el.className).toContain('field')
  })

  it('forwards change events', () => {
    let value = ''
    const { container } = render(<DateInput onChange={(e) => { value = e.target.value }} />)
    fireEvent.change(container.querySelector('input')!, { target: { value: '2026-12-25' } })
    expect(value).toBe('2026-12-25')
  })
})
