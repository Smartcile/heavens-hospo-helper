import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { CalendarClient } from '@/components/admin/CalendarClient'

describe('CalendarClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing with ADMIN role', () => {
    const { container } = render(
      <CalendarClient role="ADMIN" sessionVenueId="" />
    )
    expect(container).toBeTruthy()
  })

  it('renders calendar heading', () => {
    const { getByText } = render(
      <CalendarClient role="ADMIN" sessionVenueId="" />
    )
    expect(getByText('CALENDAR')).toBeTruthy()
  })
})
