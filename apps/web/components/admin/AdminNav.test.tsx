import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/venues',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Stub window.location.reload for VenueSwitcher
Object.defineProperty(window, 'location', {
  value: { reload: vi.fn() },
  writable: true,
})

import { AdminNav } from '@/components/admin/AdminNav'

describe('AdminNav', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<AdminNav role="ADMIN" venueId="v1" defaultVenueId={null} />)
    expect(container).toBeTruthy()
  })

  it('renders navigation group labels', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(<AdminNav role="ADMIN" venueId="v1" defaultVenueId={null} />)
    expect(getByText('Venue')).toBeTruthy()
    expect(getByText('Overview')).toBeTruthy()
  })
})
