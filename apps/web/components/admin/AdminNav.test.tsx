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
    const { container } = render(<AdminNav role="ADMIN" venueId="v1" defaultVenueId={undefined} availableVenueIds={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders navigation group labels', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(<AdminNav role="ADMIN" venueId="v1" defaultVenueId={undefined} availableVenueIds={[]} />)
    expect(getByText('Dashboard')).toBeTruthy()
    expect(getByText('Team & execution')).toBeTruthy()
    expect(getByText('Setup & config')).toBeTruthy()
  })

  it('hides groups whose areas are not granted when grantedAreas is provided', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { queryByText, getByText } = render(
      <AdminNav
        role="MANAGER"
        venueId="v1"
        defaultVenueId={undefined}
        availableVenueIds={[]}
        grantedAreas={['compliance', 'bookings']}
      />,
    )
    expect(getByText('Compliance')).toBeTruthy()
    expect(queryByText('OPS HUB')).toBeNull() // mapped to `ops` — not granted
    expect(queryByText('Performance')).toBeNull()
    expect(getByText('Setup & config')).toBeTruthy() // Settings stays ungated (venue settings)
    expect(getByText('Dashboard')).toBeTruthy() // Overview stays ungated
  })

  it('shows everything when grantedAreas is omitted (legacy behaviour)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(<AdminNav role="MANAGER" venueId="v1" defaultVenueId={undefined} availableVenueIds={[]} />)
    expect(getByText('OPS HUB')).toBeTruthy()
    expect(getByText('Performance')).toBeTruthy()
    expect(getByText('Setup & config')).toBeTruthy()
  })
})
