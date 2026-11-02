import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvailabilityBar } from '@/components/availability/AvailabilityBar'

describe('AvailabilityBar', () => {
  it('renders one labelled row per window', () => {
    render(
      <AvailabilityBar
        windows={[
          { type: 'UNAVAILABLE', startTime: '00:00', endTime: '07:00' },
          { type: 'AVAILABLE', startTime: '07:00', endTime: '15:00' },
        ]}
        isAllDay={false}
        type="AVAILABLE"
        labelled
      />,
    )
    expect(screen.getByText('07:00–15:00')).toBeDefined()
    expect(screen.getByText('00:00–07:00')).toBeDefined()
  })

  it('draws the weekly-series marker in the block corner', () => {
    render(
      <AvailabilityBar
        windows={[{ type: 'AVAILABLE', startTime: '09:00', endTime: '17:00' }]}
        isAllDay={false}
        type="AVAILABLE"
        labelled
        series={{ endDate: null }}
      />,
    )
    expect(screen.getByText('⟳')).toBeDefined()
  })

  it('hides the series marker when the day is not in a series', () => {
    render(
      <AvailabilityBar
        windows={[{ type: 'AVAILABLE', startTime: '09:00', endTime: '17:00' }]}
        isAllDay={false}
        type="AVAILABLE"
        labelled
      />,
    )
    expect(screen.queryByText('⟳')).toBeNull()
  })

  it('shows NOT SET for a labelled bar with no windows', () => {
    render(<AvailabilityBar windows={[]} isAllDay={false} type="AVAILABLE" labelled />)
    expect(screen.getByText('NOT SET')).toBeDefined()
  })
})
