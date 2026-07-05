import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { FloorPlansClient } from '@/components/admin/FloorPlansClient'

describe('FloorPlansClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing (initial state)', () => {
    const { container } = render(
      <FloorPlansClient role="ADMIN" venueId="venue-1" />
    )
    expect(container).toBeTruthy()
  })

  it('renders the FLOOR PLAN heading', () => {
    const { getByText } = render(
      <FloorPlansClient role="ADMIN" venueId="venue-1" />
    )
    expect(getByText('FLOOR PLAN')).toBeTruthy()
  })

  it('renders with MANAGER role and venueId', () => {
    const { container } = render(
      <FloorPlansClient role="MANAGER" venueId="venue-a" />
    )
    expect(container).toBeTruthy()
  })
})
