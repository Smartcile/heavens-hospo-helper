import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DateNav } from '@/components/admin/DateNav'
import type { DateRange } from '@/lib/date-nav'

describe('DateNav', () => {
  it('renders the long date and all nav links', () => {
    render(<DateNav date="2026-08-09" onChange={() => {}} />)
    expect(screen.getByText('SUNDAY, 9TH AUGUST 2026')).toBeTruthy()
    for (const label of ['<< WEEK', '< DAY', 'SELECT', 'DAY >', 'WEEK >>']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('shifts a day with the DAY > link', () => {
    const onChange = vi.fn()
    render(<DateNav date="2026-08-09" onChange={onChange} />)
    fireEvent.click(screen.getByText('DAY >'))
    expect(onChange).toHaveBeenCalledWith('2026-08-10', { start: '2026-08-10', end: '2026-08-10' })
  })

  it('opens the whole previous week with the << WEEK link', () => {
    const onChange = vi.fn()
    render(<DateNav date="2026-08-09" onChange={onChange} />)
    fireEvent.click(screen.getByText('<< WEEK'))
    expect(onChange).toHaveBeenCalledWith('2026-07-27', { start: '2026-07-27', end: '2026-08-02' })
  })

  it('in week mode shows WEEK + MONTH nav and steps whole weeks', () => {
    const onChange = vi.fn()
    render(
      <DateNav
        date="2026-08-10"
        range={{ start: '2026-08-10', end: '2026-08-16' }}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('<< MONTH')).toBeTruthy()
    expect(screen.getByText('< WEEK')).toBeTruthy()
    expect(screen.getByText('WEEK >')).toBeTruthy()
    expect(screen.getByText('MONTH >>')).toBeTruthy()

    fireEvent.click(screen.getByText('WEEK >'))
    expect(onChange).toHaveBeenCalledWith('2026-08-17', { start: '2026-08-17', end: '2026-08-23' })
  })

  it('in week mode the MONTH links open the whole month', () => {
    const onChange = vi.fn()
    render(
      <DateNav
        date="2026-08-10"
        range={{ start: '2026-08-10', end: '2026-08-16' }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByText('<< MONTH'))
    expect(onChange).toHaveBeenCalledWith('2026-07-01', { start: '2026-07-01', end: '2026-07-31' })
    fireEvent.click(screen.getByText('MONTH >>'))
    expect(onChange).toHaveBeenCalledWith('2026-09-01', { start: '2026-09-01', end: '2026-09-30' })
  })

  it('in month mode steps whole months', () => {
    const onChange = vi.fn()
    render(
      <DateNav
        date="2026-08-01"
        range={{ start: '2026-08-01', end: '2026-08-31' }}
        onChange={onChange}
      />,
    )
    expect(screen.queryByText('<< MONTH')).toBeNull()
    fireEvent.click(screen.getByText('MONTH >'))
    expect(onChange).toHaveBeenCalledWith('2026-09-01', { start: '2026-09-01', end: '2026-09-30' })
  })

  it('opens the popover on SELECT showing three months and applies a picked day', () => {
    const onChange = vi.fn()
    render(<DateNav date="2026-08-09" onChange={onChange} />)
    fireEvent.click(screen.getByText('SELECT'))
    expect(screen.getByText('AUG 2026')).toBeTruthy()
    expect(screen.getByText('SEP 2026')).toBeTruthy()
    expect(screen.getByText('OCT 2026')).toBeTruthy()
    fireEvent.click(screen.getAllByText('14')[0]) // August 14
    fireEvent.click(screen.getByText('APPLY'))
    expect(onChange).toHaveBeenCalledWith('2026-08-14', { start: '2026-08-14', end: '2026-08-14' })
  })

  it('cancels without applying', () => {
    const onChange = vi.fn()
    render(<DateNav date="2026-08-09" onChange={onChange} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getAllByText('20')[0])
    fireEvent.click(screen.getByText('CANCEL'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('WEEK mode binds start/end to the week boundaries and applies', () => {
    const onChange = vi.fn()
    render(<DateNav date="2026-08-09" onChange={onChange} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('WEEK'))
    fireEvent.click(screen.getAllByText('14')[0])
    expect(screen.getByText('AUG 10, 2026')).toBeTruthy()
    expect(screen.getByText('AUG 16, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('APPLY'))
    expect(onChange).toHaveBeenCalledWith('2026-08-10', { start: '2026-08-10', end: '2026-08-16' })
  })

  it('MONTH mode binds start/end to the month boundaries', () => {
    const onChange = vi.fn()
    render(<DateNav date="2026-08-09" onChange={onChange} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('MONTH'))
    fireEvent.click(screen.getAllByText('14')[0])
    expect(screen.getByText('AUG 1, 2026')).toBeTruthy()
    expect(screen.getByText('AUG 31, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('APPLY'))
    expect(onChange).toHaveBeenCalledWith('2026-08-01', { start: '2026-08-01', end: '2026-08-31' })
  })

  it('CUSTOM mode sets a range with two clicks and applies it', () => {
    const onChange = vi.fn()
    render(<DateNav date="2026-08-09" onChange={onChange} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('CUSTOM'))
    fireEvent.click(screen.getAllByText('10')[0])
    fireEvent.click(screen.getAllByText('12')[0])
    expect(screen.getByText('AUG 10, 2026')).toBeTruthy()
    expect(screen.getByText('AUG 12, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('APPLY'))
    expect(onChange).toHaveBeenCalledWith('2026-08-10', { start: '2026-08-10', end: '2026-08-12' })
  })

  it('CUSTOM mode swaps when the second click is earlier', () => {
    render(<DateNav date="2026-08-09" onChange={() => {}} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('CUSTOM'))
    fireEvent.click(screen.getAllByText('20')[0])
    fireEvent.click(screen.getAllByText('10')[0])
    expect(screen.getByText('AUG 10, 2026')).toBeTruthy()
    expect(screen.getByText('AUG 20, 2026')).toBeTruthy()
  })

  it('WEEK mode auto-highlights the week of the current date without a click', () => {
    render(<DateNav date="2026-08-14" onChange={() => {}} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('WEEK'))
    expect(screen.getByText('AUG 10, 2026')).toBeTruthy()
    expect(screen.getByText('AUG 16, 2026')).toBeTruthy()
  })

  it('MONTH mode auto-highlights the month of the current date without a click', () => {
    render(<DateNav date="2026-08-14" onChange={() => {}} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('MONTH'))
    expect(screen.getByText('AUG 1, 2026')).toBeTruthy()
    expect(screen.getByText('AUG 31, 2026')).toBeTruthy()
  })

  it('CUSTOM mode resets the selection', () => {
    render(<DateNav date="2026-08-14" onChange={() => {}} />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('WEEK'))
    expect(screen.getByText('AUG 10, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('CUSTOM'))
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows the read-only business hours', () => {
    render(<DateNav date="2026-08-09" onChange={() => {}} />)
    fireEvent.click(screen.getByText('SELECT'))
    expect(screen.getByText('06:00')).toBeTruthy()
    expect(screen.getByText('05:59')).toBeTruthy()
  })

  it('saves and displays a week range after apply', () => {
    function Harness() {
      const [d, setD] = useState('2026-08-09')
      const [r, setR] = useState<DateRange | null>(null)
      return (
        <DateNav
          date={d}
          range={r ?? undefined}
          onChange={(dd, rr) => {
            setD(dd)
            setR(rr)
          }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByText('SELECT'))
    fireEvent.click(screen.getByText('WEEK'))
    fireEvent.click(screen.getAllByText('14')[0])
    fireEvent.click(screen.getByText('APPLY'))
    expect(screen.getByText('10TH – 16TH AUGUST 2026')).toBeTruthy()
  })

  it('restores an applied range when the popover reopens', () => {
    render(
      <DateNav
        date="2026-08-10"
        range={{ start: '2026-08-10', end: '2026-08-16' }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('10TH – 16TH AUGUST 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('SELECT'))
    expect(screen.getByText('AUG 10, 2026')).toBeTruthy()
    expect(screen.getByText('AUG 16, 2026')).toBeTruthy()
  })

  it('reopens in the mode that is already displayed', () => {
    const onChange = vi.fn()
    render(
      <DateNav
        date="2026-08-10"
        range={{ start: '2026-08-10', end: '2026-08-16' }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByText('SELECT'))
    // The WEEK tab is preselected — no need to click it again before picking.
    expect(screen.getByText('WEEK').className).toContain('bg-white')
    fireEvent.click(screen.getAllByText('14')[0])
    fireEvent.click(screen.getByText('APPLY'))
    expect(onChange).toHaveBeenCalledWith('2026-08-10', { start: '2026-08-10', end: '2026-08-16' })
  })

  it('reopens in MONTH mode for a displayed month range', () => {
    const onChange = vi.fn()
    render(
      <DateNav
        date="2026-08-01"
        range={{ start: '2026-08-01', end: '2026-08-31' }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByText('SELECT'))
    expect(screen.getByText('MONTH').className).toContain('bg-white')
    fireEvent.click(screen.getAllByText('14')[0])
    fireEvent.click(screen.getByText('APPLY'))
    expect(onChange).toHaveBeenCalledWith('2026-08-01', { start: '2026-08-01', end: '2026-08-31' })
  })

  it('shows the single long date when a day range is applied', () => {
    render(
      <DateNav
        date="2026-08-14"
        range={{ start: '2026-08-14', end: '2026-08-14' }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('FRIDAY, 14TH AUGUST 2026')).toBeTruthy()
  })
})
